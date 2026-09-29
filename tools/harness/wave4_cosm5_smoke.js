// Harness body (wave 4 cosm5, run 2): smoke_land.js first (land on three moons, take off: nothing else may break), then dress the
// player in Glitch + Tiny CRT + Jetpack, play the "Praise the Algorithm" emote and leave the third-person emote camera for the screenshot.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5189 --script tools/harness/wave4_cosm5_smoke.js --shot /tmp/cosm5_emote.png --wait 4000
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const res = [];
for (const m of ['hamsi', 'levrek', 'palamut']) {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
  res.push({ m, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size });
  g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
}
const C = g.cosm5;
for (const e of C.catalog()) C.grant(e.slot + ':' + e.id, { quiet: true });
const equip = [g.cosmetics.equip('suit', 'glitch'), g.cosmetics.equip('hat', 'crt'), g.cosmetics.equip('back', 'jetpack')];
g.emotes.buildWheel();
const def = g.emotes.list.find((e) => e.id === 'praise');
if (def) g.emotes.play(def);
for (let i = 0; i < 16; i++) { kefal.tick(4, 1 / 30, i === 15); await new Promise((r) => setTimeout(r, 15)); }
return { res, errs, equip, emoteNet: g.emote, emoteActive: g.emotes.active, look: g.cosmetics.current() };
