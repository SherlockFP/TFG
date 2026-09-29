// Headless body (NOT run yet - the lead batches browser checks): exercises the survival module in the real game.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_survival.js --shot out.png --wait 4000
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const sv = g.survival;
const out = { has: !!sv };
kefal.tick(4, 1 / 30, false);
out.fixtures = sv.state().structs;                       // stove0, brew0, ship0 (crate), ship1 (planter) expected
out.hunger = Math.round(sv.hunger);
// starter kit lies on the ship; walk to the stove
const stove = sv.structs().find((s) => s.k === 'stove');
g.player.teleport(new THREE.Vector3(stove.x, 1, stove.z + 1.2)); g.player.inShip = true;
kefal.tick(3, 1 / 30, false);
out.carried = sv.carried().map((e) => e.type);
sv.applyEaten({ ty: 'sv_p_bloodberry', tr: 'common', v: 0, bv: 0 });   // raw bite: +3 HP
// storage panel + cooking panel open without errors
sv.openStorage('ship0'); kefal.tick(1, 1 / 30, false); sv.close(); g.ui.closePanel();
sv.openCook('stove', stove.id); kefal.tick(1, 1 / 30, false); sv.close(); g.ui.closePanel();
// land on a snow moon: plants + warmth
g.run.daysLeft = 3; g.run.moon = 'palamut'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
out.snow = sv.state();
return { out, errs };
