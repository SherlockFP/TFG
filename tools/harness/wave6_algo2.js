// Headless check for algo2 (live stream hype, ghost replay, glitch exploits). Body of an async fn (window.kefal.game). Run:
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave6_algo2.js --shot out.png --wait 3000
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const warns = []; const ow = console.warn; console.warn = (...x) => { warns.push(x.map(String).join(' ').slice(0, 200)); ow(...x); };
const a = g.algo2, out = { has: !!a, warns };
if (!a) return { out, errs };
const tick = async (n) => { for (let i = 0; i < n; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 8)); } };
const land = async (moon) => { g.run.daysLeft = 5; g.run.quotaIndex = 1; g.run.moon = moon; g.player.inShip = true; const prev = g.world?.facility; g.hostLever(g.selfId); for (let n = 0; n < 150 && !(g.world?.facility && g.world.facility !== prev); n++) await tick(2); await tick(4); g.hostFinishLanding(); await tick(24); };
await land('hamsi');
const fac = g.world.facility;
out.fac = !!fac; out.glitches = a.debug.glitches().map((x) => `${x.type}@${x.x.toFixed(0)},${x.z.toFixed(0)}`);
out.glitchMeshes = !!fac?.group?.children?.some((c) => c.name === 'algo2_glitches');
const feed = document.querySelector('.a2-feed');
out.panel = !!feed && !feed.classList.contains('off');
// hype
a.debug.hype('dodge'); a.debug.hype('escape'); a.debug.hype('closet'); await tick(3);
out.hype = a.state.hype.h; out.mirror = a.state.hs; out.chatLines = a.state.chatLines.length;
// glitch use (host path): walk to the first non-dup glitch and use it
const gl = a.debug.glitches().find((x) => x.type !== 'dup') || a.debug.glitches()[0];
if (gl) {
  g.player.teleport(new THREE.Vector3(gl.x, gl.y + 0.1, gl.z), 0); await tick(4);
  const before = g.player.pos.clone();
  if (gl.type !== 'dup') a.debug.hostUse({ id: gl.id }, g.selfId);
  await tick(6);
  out.used = { type: gl.type, moved: gl.type === 'wall' ? +before.distanceTo(g.player.pos).toFixed(1) : null, meter: a.debug.patch().meter };
}
// ghost: record 8 s of walking, die, pay out at silver, take off, land again on the same moon
const p0 = g.player.pos.clone();
for (let i = 0; i < 80; i++) a.state.rec.feed(0.11, [{ id: g.selfId, x: p0.x + i * 0.1, y: p0.y, z: p0.z, yaw: 1 + i * 0.02, skip: false }]);
g.hostOnPlayerDied(g.selfId, { cause: 'test', pos: [p0.x, p0.y, p0.z] });
out.stored = JSON.stringify(a.debug.store()?.ghosts || {}).length;
a.state.hype.h = 70;
const crates0 = g.profile?.daily?.crates?.length || 0;
g.spawnInShip(); await tick(3);
out.pre = { phase: g.run.phase, day: g.run.day, h: a.state.hype.h, aboard: (g.aiPlayers() || []).filter((p) => p.inShip).length };
g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(12);
out.post = { phase: g.run.phase, day: g.run.day, a2: JSON.stringify(g.run.a2).slice(0, 120) };
out.want = g.run.a2?.want; out.cratesDelta = (g.profile?.daily?.crates?.length || 0) - crates0;
// second landing, same moon: the ghost replays
await land('hamsi');
out.land2 = { phase: g.run.phase, day: g.run.day, fac: !!g.world.facility, a2: JSON.stringify(g.run.a2).slice(0, 120) };
out.ghosts = a.debug.ghosts().length; out.ghostViews = a.view.ghostCount(); out.storeAfter = Object.keys(a.debug.store()?.ghosts || {});
const anc = a.view.ghostAnchors()[0];
if (anc) { g.player.teleport(new THREE.Vector3(anc[0] - 4, anc[1] + 0.1, anc[2]), -Math.PI / 2); await tick(20); }
out.meterAfterLanding = a.debug.patch().meter;
out.warnsEnd = warns.slice(0, 6); out.hypeEnd = { host: a.state.hype.h, mirror: { ...a.state.hs } };
return { out, errs };
