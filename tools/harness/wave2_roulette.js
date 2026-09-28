// THE ALGORITHM'S REVOLVER headless check (body of an async function for headless.mjs; `kefal.game`, `kefal.tick`, `THREE`):
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5261 --script tools/harness/wave2_roulette.js
// Forces a ship table, sits solo, checks the solo-pass refusal, a forced EMPTY pull (pot 1), CASH OUT (power-up paid), then a forced LIVE pull (real death, 'lost at roulette', table closed).
const g = kefal.game, A = g.anomaly, R = A?.roulette, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const tick = (n, dt = 1 / 30) => kefal.tick(n, dt, false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { module: !!R };
if (!R) return { ...out, errs };
g.godMode = false;
const T = R.spawn({ x: 3.6, y: 0, z: -0.7 }, 0.4, 's');
out.model = !!T.model?.group?.parent;
g.player.teleport(new THREE.Vector3(4.6, 0.05, 0.4)); g.player.inShip = true;
tick(3); await sleep(30);
R.sit('s'); tick(6); await sleep(30);
out.seated = { local: R.seated(), seats: R.state('s').seats.filter(Boolean).length, turnIsMe: R.state('s').seats[R.state('s').turn] === g.selfId };
const s0 = JSON.stringify(R.state('s')); R.pass('s'); tick(4);
out.soloPassRefused = JSON.stringify(R.state('s')) === s0;
R.force.live(5, 's'); R.pull('s'); tick(60); await sleep(30);
out.afterEmpty = { fired: R.state('s').fired, pot: R.state('s').pots[g.selfId], dead: g.player.dead };
tick(40); R.force.actGap();
const c0 = g.progress?.p?.coins || 0; A.clear();
R.cash('s'); tick(10); await sleep(30);
out.afterCash = { local: R.seated(), buffs: A.buffs.list().map((b) => b.id), coins: (g.progress?.p?.coins || 0) - c0, seats: R.state('s').seats.filter(Boolean).length };
tick(40); R.force.actGap();
R.sit('s'); tick(6); await sleep(30);
out.sat2 = R.seated();
R.force.live(R.state('s').fired, 's'); R.force.actGap();
R.pull('s'); tick(50); await sleep(50); tick(20);
out.afterLive = { dead: g.player.dead, closed: R.state('s').closed, seats: R.state('s').seats.filter(Boolean).length, deathText: g.deathText('lost at roulette'), body: [...g.items.all()].some((it) => it.type === 'body'), local: R.seated() };
out.errs = errs.slice(0, 5);
return out;
