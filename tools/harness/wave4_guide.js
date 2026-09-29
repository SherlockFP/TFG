// wave 4 GUIDE proof (body of an async fn for tools/harness/headless.mjs): module installed, registry, terminal commands, tutorial from real events,
// advisor tip in the intercom box, mute. Returns key numbers; page errors are printed by the runner.
const g = kefal.game, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const G = g.guide;
out.installed = !!G;
if (!G) return out;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
out.features = G.features().length; out.visible = G.features().filter((f) => !f.hidden).length;
out.tut0 = G.tutorial();
out.commands = ['guide', 'tips', 'tutorial', 'algo'].map((c) => [c, !!g.mods.commands.get(c)]);

// ---- terminal
const term = g.terminal; term.open();
const lastText = (n = 6) => term.lines.slice(-n).map((l) => l.text);
term.exec('guide'); out.guideList = lastText(8);
term.exec('guide store'); out.guideStore = lastText(7);
term.exec('guide all'); out.guideAllLines = term.lines.length; out.guideAllHead = term.lines.slice(-60).slice(0, 3).map((l) => l.text);
term.exec('algo tips'); out.algoTips = lastText(3);
term.exec('algo'); out.algoOrig = lastText(3);       // the lore module's own ALGO output must still work
term.exec('stor'); out.didYouMean = lastText(2);
term.exec('tutorial status'); out.tutStatus = lastText(1);
term.exec('help'); await sleep(200); out.helpTail = lastText(3);
out.usedAfterCmds = G.state().used;
term.close();

// ---- tutorial from real events
const p = g.player;
kefal.tick(4, 1 / 30, false);
// movement: run + crouch while moving (poll reads the player flags)
p.teleport(new THREE.Vector3(0, 1, 0));
for (let i = 0; i < 60; i++) { p.sprinting = true; p.crouch = i > 30; p.teleport(new THREE.Vector3(i * 0.3, 1, 0)); kefal.tick(1, 1 / 30, false); await sleep(5); }
out.afterMove = G.tutorial();
g.scan(); kefal.tick(2, 1 / 30, false);
g.inventory?.open?.(); kefal.tick(2, 1 / 30, false); g.ui.closePanel?.(true);
out.afterScanInv = G.tutorial();
// flashlight: spawn one into our hands and switch it on
const iid = g.items.hostSpawn('flashlight', new THREE.Vector3(1, 1.2, 0), { holder: g.selfId });
kefal.tick(6, 1 / 30, false);
const fl = g.items.get(iid);
if (fl) { const slot = p.slots.indexOf(iid); out.flSlot = slot; try { g.toggleFlashlight(); } catch (e) { out.flErr = e.message; } }
kefal.tick(20, 1 / 30, false); await sleep(400);
out.afterFlash = G.tutorial();
// objectives line
g.objectives.update(1); out.objectives = [...document.querySelectorAll('.objectives .obj')].map((e) => e.textContent);
// finish the rest with the event hook (scrap / ship / sell need a full landing + HQ trip: covered by the node test)
for (const ev of ['scrap', 'ship', 'sell']) G.tutEvent(ev);
kefal.tick(2, 1 / 30, false);
out.afterAll = G.tutorial();
await sleep(300);

// ---- advisor: give unspent skill points, run the clock past the grace + cooldown, expect a tip in the intercom box
const pr = g.profile; pr.skillPoints = 3;
g.run.phase = 'orbit'; g.player.inShip = true;
const ctx = G.ctx(); out.ctx = ctx;
for (let i = 0; i < 140; i++) { kefal.tick(5, 0.2, false); }   // 140 s of game time
await sleep(600); kefal.tick(3, 0.2, false);
out.dbg = G.debug();
const box = document.querySelector('.algo-sub');
out.boxText = box ? box.querySelector('.algo-text').textContent : null;
out.boxOn = !!box?.classList.contains('on');
// mute
g.settings.guideTips = false; out.muted = true;
out.errs = errs;
return out;
