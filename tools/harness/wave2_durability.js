// Wave-2 durability feature check (body for headless.mjs): real swing / hit wear, warning toasts, a common pipe shattering (scrap left),
// a Rare machete becoming BROKEN (cannot attack, value x0.3), bench repair (parts + credits + ageing), Repair Kit, HQ mechanic (credits only),
// broken armour giving nothing, hotbar bar / BROKEN class / tooltip / REPAIR tab DOM, serialization + save fields.
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5266 --script tools/harness/wave2_durability.js
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 3, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(15); };
const out = { installed: !!g.durability };
if (!g.durability) return out;
const dura = g.durability, D = dura.D;
dura.debug.skipNear = true;
const toasts = [];
const origToast = g.ui.toast.bind(g.ui);
g.ui.toast = (s, k) => { toasts.push(s); return origToast(s, k); };
const P = () => g.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
const spawn = async (ty, opts = {}) => { const id = g.items.hostSpawn(ty, P(), { holder: g.selfId, ...opts }); await tick(); return id; };
const hold = async (id) => { const i = g.player.slots.indexOf(id); if (i >= 0) g.switchSlot(i); await tick(); };
const worldItems = (ty) => [...g.items.all()].filter((it) => it.type === ty);
const chk = {};

// ---- 1) common pipe: real swings cost 0.4 (miss) and a connect costs 0.4 + 0.6
const pipeId = await spawn('pipe', { tier: 'common' }); await hold(pipeId);
const pipe = g.items.get(pipeId);
out.pipeMax = D.itemMax(pipe);                                  // 120
chk.pipeHeld = g.player.heldItem() === pipe;
g.time += 5; g.meleeSwing(pipe, 1); await tick(4);              // whiff
out.afterMiss = D.itemDur(pipe);                                // 119.6
g.time += 5; g.meleeSwing(pipe, 1); await tick(3);
g.net.request('hit', { cid: 'nonexistent', dmg: 5 });           // the connect hook counts the outgoing hit request (host ignores the unknown cid)
await tick(2);
out.afterHit = D.itemDur(pipe);                                 // 119.6 - 0.4 - 0.6 = 118.6
chk.missCost = Math.abs(out.afterMiss - 119.6) < 0.05;
chk.hitCost = Math.abs(out.afterHit - 118.6) < 0.05;

// ---- 2) warnings at 25 % / 10 %, then it shatters (Common = destroyed, one scrap shard left)
const scrapBefore = worldItems('shard_scrap').length;
dura.wear(pipe, D.itemDur(pipe) - 31, 'swing'); await tick(2);                    // 31 left (> 25 %)
dura.wear(pipe, 2, 'swing'); await tick(2);                                       // 29 (<= 25 %)
chk.warn25 = toasts.some((s) => /getting worn/.test(s));
out.barClass = pipe.dur;
g.ui.hud.setInventory(g.player.slots.map((id) => (id ? g.items.get(id) : null)), g.player.slot);
chk.hotbarBarYellow = !!document.querySelector('.inv-slot .dur-bar.dur-worn');
dura.wear(pipe, 17, 'swing'); await tick(2);                                      // 12 -> critical
chk.warn10 = toasts.some((s) => /about to break/.test(s));
g.ui.hud.setInventory(g.player.slots.map((id) => (id ? g.items.get(id) : null)), g.player.slot);
chk.hotbarBarRed = !!document.querySelector('.inv-slot .dur-bar.dur-critical');
const pipeType = pipe.type;
dura.wear(pipe, 100, 'swing'); await tick(4);
chk.pipeDestroyed = !g.items.get(pipeId);
chk.pipeBrokeToast = toasts.some((s) => /Lead Pipe broke/.test(s));
chk.scrapLeft = worldItems('shard_scrap').length === scrapBefore + 1;
chk.slotFreed = !g.player.slots.includes(pipeId);

// ---- 3) Rare machete: BROKEN, cannot attack, sells x0.3
const macheteId = await spawn('machete', { value: 100, tier: 'rare' }); await hold(macheteId);
const mach = g.items.get(macheteId);
out.macheteMax = D.itemMax(mach);                               // 234
mach.value = 100;
dura.wear(mach, 500, 'swing'); await tick(4);
chk.macheteKept = !!g.items.get(macheteId) && mach.dur === 0;
chk.macheteBrokenToast = toasts.some((s) => /Machete is BROKEN/.test(s));
chk.brokenValue = mach.value === 30;
g.time += 5; g.swingAnim = 0; g.pendingHit = null;
g.useHeldPress(); await tick(2);
chk.brokenCannotAttack = !g.pendingHit && g.swingAnim === 0 && g.nextSwing > g.time;
g.ui.hud.setInventory(g.player.slots.map((id) => (id ? g.items.get(id) : null)), g.player.slot);
chk.hotbarBrokenClass = !!document.querySelector('.inv-slot.dur-broken .dur-crack');
const tip = (await import('/src/ui/inventory_panel.js')).itemTooltipHTML(mach, mach.def);
chk.tooltipDurability = /Durability/.test(tip) && /BROKEN/.test(tip);

// ---- 4) bench repair: parts + credits, restores 100 % of the aged max, x1/0.3 value back
g.run.credits = 500;
const parts = [];
for (const ty of ['comp_scrapmetal', 'comp_scrapmetal', 'comp_scrapmetal', 'comp_scrapmetal', 'comp_scrapmetal', 'comp_cloth', 'comp_circuit', 'comp_circuit', 'shard_crystal']) parts.push(await spawn(ty));
const plan = D.repairPlan(mach, 'bench');
out.plan = { comps: plan.comps, shard: plan.shard, credits: plan.credits, newMax: plan.newMax };
await wait(400);
g.net.request('durep', { id: macheteId, via: 'bench' }); await tick(3);
chk.benchRepaired = mach.dur === plan.newMax && mach.dr === 1;
chk.benchAged = plan.newMax === Math.round(234 * 0.95);
chk.benchPaid = g.run.credits === 500 - plan.credits;
chk.benchConsumed = parts.filter((id) => !g.items.get(id)).length === plan.comps.reduce((s, [, n]) => s + n, 0) + 1;
chk.valueRestored = Math.abs(mach.value - 100) <= 1;

// ---- 5) Repair Kit: +40 % of the max, no ageing
const kitId = await spawn('repairkit'); await wait(400);
dura.wear(mach, 100, 'swing'); await tick(2);
const before = D.itemDur(mach);
dura.useKit(g.items.get(kitId)); await tick(3);
out.kit = [Math.round(before), Math.round(D.itemDur(mach))];
chk.kitRepair = Math.abs(D.itemDur(mach) - Math.min(mach.dur, before + Math.round(D.itemMax(mach) * 0.4))) < 1 && D.itemDur(mach) > before + 80 && mach.dr === 1;
chk.kitConsumed = !g.items.get(kitId);

// ---- 6) HQ mechanic: credits only, pricier than the bench (needs phase 'company' + station proximity, bypassed with skipNear)
dura.wear(mach, 200, 'swing'); await tick(2);
const hq = D.repairPlan(mach, 'hq'), bn = D.repairPlan(mach, 'bench');
const phase0 = g.run.phase; g.run.phase = 'company'; g.run.credits = 5000;
await wait(400);
g.net.request('durep', { id: macheteId, via: 'hq' }); await tick(3);
g.run.phase = phase0;
out.hq = { hq: hq.credits, benchCredits: bn.credits, dur: mach.dur };
chk.hqRepaired = mach.dur === hq.newMax && mach.dr === 2 && g.run.credits === 5000 - hq.credits;
chk.hqCreditsOnly = hq.comps.length === 0 && hq.credits > bn.credits;

// ---- 7) armour: wear by damage taken, broken armour gives no reduction
const a0 = g.stats.armor || 0;
const kevId = await spawn('arm_kevlar', { tier: 'legendary' });
g.inventory.equip(kevId); await tick(3);
const kev = g.items.get(kevId);
const armorOn = (g.stats.armor || 0) - a0;
g.mods.emit('localHurt', { dmg: 30, cause: 'test' }, g); await tick(2);
out.armor = { max: D.itemMax(kev), afterHit: D.itemDur(kev), onBonus: +armorOn.toFixed(3) };
chk.armorWorn = Math.abs(D.itemDur(kev) - (D.itemMax(kev) - 15)) < 0.05;
dura.wear(kev, 5000, 'dmg'); await tick(4); g.refreshStats?.(); await tick(2);
chk.armorBroken = kev.dur === 0 && !!g.items.get(kevId);
chk.brokenArmorNoBonus = armorOn > 0.2 && Math.abs((g.stats.armor || 0) - a0) < 0.001;

// ---- 8) UI: workbench REPAIR tab + HQ panel render
dura.wear(g.items.get(macheteId), 60, 'swing'); await tick(2);
const co = g.crafting;
const panel = co?.open?.('repair'); await tick(3);
chk.repairTab = !!document.querySelector('.crp-tab.sel') && /REPAIR/.test(document.querySelector('.crp-tab.sel')?.textContent || '') && !!document.querySelector('.drp');
chk.repairTabRows = document.querySelectorAll('.drp-row').length >= 1;
co?.close?.(); await tick(2);

// ---- 9) sync + save fields
const ser = g.items.serialize().find((x) => x.id === kevId);
chk.serializeDur = ser?.du === 0 && ser?.dr === undefined || ser?.du === 0;
const wm = g.items.serialize().find((x) => x.id === macheteId);
chk.serializeMachete = wm?.du != null && wm?.dr === 2;
const sf = g.inventory.saveFields(g.items.get(macheteId));
chk.saveFields = sf.du != null && sf.dr === 2;
const lf = g.inventory.loadFields({ du: 12, dr: 3 });
chk.loadFields = lf.du === 12 && lf.dr === 3;
out.pending = dura.pending().size;
out.stats = dura.stats;
out.chk = chk;
out.failed = Object.entries(chk).filter(([, v]) => !v).map(([k]) => k);
out.toasts = toasts.slice(-14);
out.errs = errs;
return out;
