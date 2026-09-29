// Headless check for algo1: morning vote (keys) -> rule applied -> landing with a pending counter -> viewers event. Body of an async fn (window.kefal.game).
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const a = g.algo1, out = { has: !!a };
if (!a) return { out, errs };
let viewerEv = null; g.mods.on('tfg:viewers', (d) => { viewerEv = d; });
const tick = async (n) => { for (let i = 0; i < n; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 8)); } };
g.run.phase = 'orbit'; g.run.quotaIndex = 1; g.run.moon = 'hamsi';
a.debug.openVote(); await tick(5);
out.cards = a.state.vote?.cards; out.uiShown = document.querySelector('.a1-vote')?.style.display;
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', bubbles: true })); await tick(10);
out.rule = a.state.rule; out.debt = g.run.a1?.debt; out.uiAfter = document.querySelector('.a1-vote')?.style.display;
a.bump('escape'); await tick(3);
out.viewerEv = viewerEv; out.live = document.querySelector('.algo-live')?.textContent || null;
// landing with a pending counter (route -> left)
a.state.pend = { kind: 'route', side: 'L', type: 'scuttler', share: 0.8 };
const before = g.creatures.host.size;
g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); await tick(20);
out.creaturesDelta = g.creatures.host.size - before; out.pendLeft = a.state.pend; out.fx = a.fx();
g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(5);
out.ruleAfterOrbit = a.state.rule;
return { out, errs };
