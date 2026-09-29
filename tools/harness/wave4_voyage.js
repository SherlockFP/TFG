// Body of an async fn for tools/harness/headless.mjs (NOT RUN yet - the browser queue was closed): exercises the voyage module in the real game.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_voyage.js --shot /tmp/voyage.png --wait 4000
const g = kefal.game, R = { errs: [] };
addEventListener('error', (e) => R.errs.push(e.message));
const V = g.voyage;
if (!V) return { installed: false };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
g.run.phase = 'orbit'; g.run.quotaIndex = 3; g.run.daysLeft = 3; g.run.credits = 500;
// a temple voyage: land next to the set piece
const id = V.core.makeVoyageId(2, 'temple', 12345);
V.core.registerVoyageMoon(id);
g.run.moon = id; g.broadcastRun(['moon']);
g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await wait(10); }
const vw = g.world.outdoor?.voyage;
R.moon = g.run.moon; R.biome = g.world.outdoor?.plan?.biome?.name; R.content = !!vw?.content; R.inter = vw?.content?.inter?.length; R.creatures = g.creatures.host.size;
const c = vw?.content?.flat;
if (c) g.player.teleport(new THREE.Vector3(c.x + 9, (vw.content.y0 || 0) + 2, c.z + 9));
for (let i = 0; i < 10; i++) { kefal.tick(5, 1 / 30, true); await wait(10); }
R.stats = V.stats;
return R;
