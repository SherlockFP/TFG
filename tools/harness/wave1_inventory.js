// Wave-1 inventory feature check (body for headless.mjs): panel open/close, stash, equip bag + armor + trinkets,
// full-hotbar pickup into the bag, consume, drop, tier roll distribution, late-join serialization, save/reclaim,
// death drop. Returns numbers; leaves the I panel open (with a tooltip) for the screenshot.
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5181 --script tools/harness/wave1_inventory.js --shot /tmp/inventory.png
const g = kefal.game, inv = g.inventory, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 3) => { kefal.tick(n, 1 / 30, false); await wait(15); };
const out = { installed: !!inv };
if (!inv) return out;
const P = () => g.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
const spawn = (ty, opts = {}) => g.items.hostSpawn(ty, P(), { holder: g.selfId, ...opts });
const mineHeld = () => [...g.items.all()].filter((it) => it.holder === g.selfId);

// 1) panel open / close
inv.open(); await tick();
out.panelOpen = inv.isOpen() && !!document.querySelector('.tinv');
inv.close(); await tick();
out.panelClosed = !inv.isOpen() && !document.querySelector('.tinv');

// 2) stash a hotbar item into the pockets (4x2)
const duck = spawn('duck'); await tick();
out.duckHotbar = g.player.slots.includes(duck);
inv.quickMove(duck); await tick();
out.duckStashed = g.items.get(duck)?.inv?.k === 'bag' && !g.player.slots.includes(duck);
out.pockets = inv.bagSize();

// 3) equip a bag, armor (legendary) and trinkets
const pack = spawn('bag_fieldpack'); await tick();
inv.equip(pack); await tick();
out.bagSize = inv.bagSize();
out.bagEquipped = inv.equipped('bag')?.id === pack;
const armor0 = g.stats.armor || 0, scan0 = g.stats.scanRange;
const kev = spawn('arm_kevlar', { tier: 'legendary' }); await tick();
inv.equip(kev); await tick();
out.armorDelta = +((g.stats.armor || 0) - armor0).toFixed(3);   // expect 0.18 * 1.6 = 0.288
const dongle = spawn('trk_dongle', { tier: 'rare' }), amulet = spawn('trk_amulet', { tier: 'epic' }); await tick();
inv.equip(dongle); await tick(); inv.equip(amulet); await tick();
out.trinkets = [inv.equipped('trinket1')?.type, inv.equipped('trinket2')?.type];
out.scanDelta = +(g.stats.scanRange - scan0).toFixed(2);          // expect 8 * 1.4 = 11.2
out.speedMul = +g.stats.speedMul.toFixed(3);

// 4) addToBag rules: hot GPU refused, bolt (1x2) accepted
const gpu = spawn('gpu'), bolt = spawn('bolt', { tier: 'rare' }); await tick();
out.gpuRefused = inv.addToBag(gpu) === false;
out.boltToBag = inv.addToBag(bolt); await tick();
out.boltInv = g.items.get(bolt)?.inv;

// 5) full hotbar -> E pickup goes straight into the bag
for (const ty of ['flashlight', 'walkie', 'medkit']) spawn(ty);
await tick();
out.hotbar = g.player.slots.map((id) => g.items.get(id)?.type || null);
const coinId = g.items.hostSpawn('cryptocoin', g.player.pos.clone().add(new THREE.Vector3(0.6, 0.4, 0)), { tier: 'epic' }); await tick();
g.pickup(g.items.get(coinId)); await tick();
out.pickToBag = g.items.get(coinId)?.inv?.k === 'bag' && g.items.get(coinId)?.holder === g.selfId;

// 6) consume (host-authoritative, promise)
spawn('shells', { inv: 'bag' }); spawn('shells', { inv: 'bag' }); await tick();
out.shellsBefore = inv.countItem('shells');
out.consumeOk = await inv.consume('shells', 1); await tick();
out.shellsAfter = inv.countItem('shells');
out.consumeTooMany = await inv.consume('shells', 5);

// 7) move inside the grid + swap, sort, drop to the world
const dA = inv.planMove(duck, { k: 'bag', x: 5, y: 3 });
out.planDuck = dA.ok; inv.doMove(duck, { k: 'bag', x: 5, y: 3 }); await tick();
out.duckAt = g.items.get(duck)?.inv;
out.sorted = inv.sortBag(); await tick();
inv.doMove(duck, { k: 'world' }); await tick(5);
out.dropped = g.items.get(duck)?.state === 'world' && !g.items.get(duck)?.inv;
out.bagDropPlanOk = inv.planMove(pack, { k: 'world' }).ok;        // dropping the worn bag: contents repack into the pockets (or refuse)

// 8) tier roll distribution (host resolver, 5000 rolls, scrap) at luck 0 / 0.3 + current crew luck
const roll = (luck) => { const d = {}; for (let i = 0; i < 5000; i++) { const t = g.items.hostResolveTier(g.itemDefOf('bolt'), { luck }); d[t] = (d[t] || 0) + 1; } return d; };
out.tiers0 = roll(0); out.tiers30 = roll(0.3);
out.hostLootLuck = +inv.hostLootLuck().toFixed(3);
out.storeKevlarTier = g.items.hostResolveTier(g.itemDefOf('arm_kevlar'), {}) || 'common(null)';
out.lootKevlarTier = !!g.items.hostResolveTier(g.itemDefOf('arm_kevlar'), { valueMul: 1 });
// tier value multiplier on spawn: 40 gold bars far below the ship, mean value per tier
const vals = {};
for (let i = 0; i < 40; i++) { const id = g.items.hostSpawn('goldbar', new THREE.Vector3(200 + i, -60, 200), { valueMul: 1 }); const it = g.items.get(id); (vals[it.tier] ||= []).push(it.value); g.net.broadcast('it', { e: 'rm', id }); }
out.goldbarMeanByTier = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));

// 9) world tier beams (rare+ items lying around)
for (const tr of ['rare', 'epic', 'legendary', 'mythic']) g.items.hostSpawn('trophy', g.player.pos.clone().add(new THREE.Vector3(2, 0.5, 0)), { tier: tr });
await tick(20);
out.beams = inv.debug().beams;

// 10) late join + save fields + reclaim
const ser = g.items.serialize((it) => it.holder === g.selfId);
out.serWithInv = ser.filter((s) => s.iv).length; out.serWithTier = ser.filter((s) => s.tr).length;
out.saveFieldsKevlar = inv.saveFields(g.items.get(kev));
{   // "reload": drop the armor into the ship with reclaim info (as hostInit restores a save), then reclaim it
  const it = g.items.get(kev);
  g.net.broadcast('it', { e: 'drop', id: kev, p: [3.5, 1.0, -1.5], q: [0, 0, 0, 1] }); await tick();
  it.reclaim = { pid: g.profile.id, iv: { k: 'eq', s: 'armor' } };
  out.reclaimed = inv.hostReclaim(g.selfId, g.profile.id); await tick();
  out.reclaimArmorBack = inv.equipped('armor')?.id === kev;
}

// 11) death drop: everything (hotbar + bag + equipment) lands at the body
out.heldBeforeDeath = mineHeld().length;
g.damageLocal(999, 'fall'); await tick(10);
out.heldAfterDeath = mineHeld().length;
out.droppedWorld = [kev, pack, bolt, coinId].filter((id) => g.items.get(id)?.state === 'world').length;
g.respawn(); await tick(5);

// 12) showcase for the screenshot: Hauler Frame full of tiered loot, hotbar + gear, tooltip on an item
spawn('bag_hauler', { inv: 'eq' }); await tick();
spawn('arm_riot', { tier: 'epic', inv: 'eq' }); spawn('trk_charm', { tier: 'uncommon', inv: 'eq' }); spawn('trk_dongle', { tier: 'legendary', inv: 'eq' });
await tick();
const show = [['goldbar', 'legendary'], ['axle', 'epic'], ['ring', 'mythic'], ['bolt', 'rare'], ['trophy', 'uncommon'], ['phone', 'rare'], ['duck', 'common'],
  ['floppies', 'common'], ['cryptocoin', 'epic'], ['keyboard', 'uncommon'], ['perfume', 'rare'], ['shells', null], ['vhs', 'common'], ['headset', 'uncommon']];
for (const [ty, tr] of show) spawn(ty, { inv: 'bag', ...(tr ? { tier: tr } : {}) });
spawn('shovel', { tier: 'epic' }); spawn('flashlight'); spawn('walkie');
await tick();
inv.sortBag(); await tick();
out.showcase = { bag: inv.bagSize(), bagItems: inv.bagItems().length, hotbar: g.player.slots.filter(Boolean).length };
inv.open(); await tick();
await wait(4000);   // icons render in idle slices (slow under swiftshader)
const el = document.querySelector('.tinv-items .ivi.t-legendary') || document.querySelector('.tinv-items .ivi');
if (el) { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); }
await wait(400);
out.tooltip = !!document.querySelector('.tinv-tip');
out.errs = errs;
return out;
