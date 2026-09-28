// MIRROR DIMENSION feature check for headless.mjs (body of an async function; `kefal.game`, `kefal.tick`, `THREE`).
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5267 --script tools/harness/wave2_mirror.js --shot /tmp/mirror.png
// Proves: a forced portal, enter (membership + uMir look + flip), waves spawn (hard cap 50), a kill drops a crystal + meter, a level-up offers 3 cards and a pick applies,
// a meter threshold drops a chest, exit restores the normal view. NOTE: written in the frozen-browser session and NOT executed (node tools/harness/mirror.test.mjs covers the pure logic).
const g = kefal.game, Mi = g.mirror, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 300)); oe(...a); };
const tick = (n, dt = 1 / 30, render = false) => kefal.tick(n, dt, render);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { module: !!Mi };
if (!Mi) return { ...out, errs };
g.godMode = true;
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.run.quotaIndex = 2; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 14; i++) { tick(10); await sleep(10); }
const P = Mi.forcePortal(14, 6);
out.portal = !!P;
g.player.teleport(new THREE.Vector3(P.x + Math.sin(P.yaw) * 2.5, P.y + 0.2, P.z + Math.cos(P.yaw) * 2.5), P.yaw);
g.player.inShip = false;
tick(6);
Mi.enter(); tick(30);
out.entered = Mi.debug();                                      // inside true, uMir[0] -> 1
for (let i = 0; i < 40; i++) { tick(30); await sleep(5); }     // ~40 s of waves
out.waves = { mobs: Mi.hostMobs().length, byType: Mi.hostMobs().reduce((a, t) => (a[t] = (a[t] || 0) + 1, a), {}), cap50: Mi.hostMobs().length <= 50 };
// kill one -> crystal + meter
const c = [...g.creatures.host.values()].find((x) => !x.dead && (x.def?.mirror || x.data?.mirror));
if (c) { g.creatures.damage(c.id, 9999, g.selfId); tick(5); }
out.afterKill = { meter: Mi.debug().meter, crystals: Mi.debug().crystals };
// level-up choice
Mi.combat.grantXp(400); tick(10);
out.cards = { open: Mi.ui.cardsOpen, choosing: Mi.combat.choosing };
if (Mi.combat.choosing) { Mi.combat.pick(0); tick(3); }
out.owned = { ...Mi.combat.owned };
// meter threshold -> chest
for (const x of [...g.creatures.host.values()]) if (!x.dead && (x.def?.mirror || x.data?.mirror)) { g.creatures.damage(x.id, 9999, g.selfId); }
tick(10);
out.chests = Mi.debug().chests; out.meter = Mi.debug().meter;
if (globalThis.__shotInside) await globalThis.__shotInside();
// exit restores the normal view
g.player.teleport(new THREE.Vector3(P.x + Math.sin(P.yaw) * 2.5, P.y + 0.2, P.z + Math.cos(P.yaw) * 2.5), P.yaw);
Mi.exit(); tick(60);
out.exited = Mi.debug();
out.errs = errs.slice(0, 20);
return out;
