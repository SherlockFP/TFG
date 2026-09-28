// Magic (wave 1) check for headless.mjs: chat casting (TR + EN), voice matcher, PUSH knocking a creature back,
// BLINK staying inside the map, learning from a skillbook, mana + cooldowns, fireball/hush/lumen smoke.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5184 --script tools/harness/wave1_magic.js --shot /tmp/magic.png
// Ends right after a PUSH cast in front of a creature so the screenshot shows the cone + the mana bar.
const g = kefal.game, M = g.magic, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 300)); oe(...a); };
const tick = (n, render = false) => kefal.tick(n, 1 / 30, render);
const out = { module: !!M };
if (!M) return out;
g.godMode = true;

// land on a factory moon
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 12; i++) { tick(10); await new Promise((r) => setTimeout(r, 10)); }
const fac = g.world.facility, nav = fac.nav;
// a scrap spot with >= 7 m of clear floor in some direction
let setup = null;
for (const s of fac.scrapSpots.filter((q) => !q.elevated)) {
  for (let k = 0; k < 8 && !setup; k++) {
    const yaw = (k * Math.PI) / 4, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let ok = true;
    for (let d = 0.5; d <= 7.5; d += 0.5) if (!nav.walkableAt(s.x + fx * d, s.z + fz * d)) { ok = false; break; }
    if (ok && g.physics.lineOfSight(new THREE.Vector3(s.x, s.y + 1, s.z), new THREE.Vector3(s.x + fx * 7.5, s.y + 1, s.z + fz * 7.5))) setup = { s, yaw, fx, fz };
  }
  if (setup) break;
}
out.setup = !!setup;
if (!setup) return { ...out, errs };
const { s, yaw, fx, fz } = setup;
const start = new THREE.Vector3(s.x, s.y + 0.2, s.z);
const stand = (y = yaw) => { g.player.teleport(start, y); g.player.pitch = 0; tick(3); };
const spawnAhead = (type, d) => {
  const c = g.creatures.hostSpawn(type, new THREE.Vector3(s.x + fx * d, fac.layout?.y ?? s.y, s.z + fz * d), { state: 'idle', level: 1 });
  c.age = 5;
  return c;
};
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- 1) PUSH via a Turkish chat word moves a creature away
stand();
for (const c of [...g.creatures.host.values()]) if (flat(c.pos, start) < 12) g.creatures.hostRemove(c.id);
let c = spawnAhead('crawler', 2.2);
tick(2);
M.mana = 100; M.resetCooldowns();
const d0 = flat(c.pos, g.player.pos), mana0 = M.mana;
g.sendChat('İT');
const manaAfter = M.mana, cdAfter = M.cooldownLeft('push');
tick(24);
const d1 = flat(c.pos, g.player.pos);
const chatLine = g.ui.chatLog.lastChild?.textContent || '';
out.pushTR = { d0: +d0.toFixed(2), d1: +d1.toFixed(2), moved: +(d1 - d0).toFixed(2), manaSpent: +(mana0 - manaAfter).toFixed(1), cd: +cdAfter.toFixed(2), chatLine, walkable: nav.walkableAt(c.pos.x, c.pos.z) };
g.creatures.hostRemove(c.id);

// ---- 2) EN chat word + cooldown + mana gates + voice matcher
stand();
M.mana = 100; M.resetCooldowns();
g.sendChat('push');
out.pushEN = { cd: +M.cooldownLeft('push').toFixed(2), chatLine: g.ui.chatLog.lastChild?.textContent || '' };
out.cooldownGate = M.cast('push').reason;
M.resetCooldowns(); M.mana = 5;
out.manaGate = M.cast('push').reason;
M.mana = 100;
out.unknownGate = M.cast('fire').reason;
M.resetCooldowns();
out.voice = M.hear('okay PUSH them now');
M.resetCooldowns();
out.notChat = (g.sendChat('push it real good'), M.cooldownLeft('push') === 0);

// ---- 3) learn BLINK from a skillbook (LMB use)
const bid = g.items.hostSpawn('skillbook_blink', g.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: g.selfId });
tick(2);
const slot = g.player.slots.indexOf(bid);
if (slot >= 0) { g.player.slot = slot; g.refreshHeldVisuals(); }
g.useHeldPress();
tick(4);
out.learn = { slot, knows: M.knows('blink'), bookGone: !g.items.get(bid), saved: (g.profile.spells || []).includes('blink') };

// ---- 4) BLINK in 8 directions never leaves the walkable floor / crosses a wall
const blinks = [];
for (let k = 0; k < 8; k++) {
  stand(yaw + (k * Math.PI) / 4);
  M.resetCooldowns(); M.mana = 100;
  const before = g.player.pos.clone();
  const r = M.cast('blink');
  const after = g.player.pos.clone();
  tick(2);
  blinks.push({ ok: r.ok, reason: r.reason, moved: +flat(before, after).toFixed(2), walk: nav.walkableAt(after.x, after.z), los: g.physics.lineOfSight(before.clone().setY(before.y + 1), after.clone().setY(after.y + 1)), dy: +(after.y - before.y).toFixed(2) });
}
out.blinks = blinks;
out.blinkSafe = blinks.every((b) => !b.ok || (b.walk && b.los && Math.abs(b.dy) < 1.2 && b.moved <= 7.1)) && blinks.some((b) => b.ok);

// ---- 5) FIREBALL damages a creature, HUSH marks the host bubble, LUMEN adds a pool emitter (not a light)
for (const id of ['fire', 'hush', 'lumen']) M.learn(id, { announce: false });
stand();
const lightsBefore = g.scene.children.filter((o) => o.isLight).length;
c = spawnAhead('spider', 4.5);
tick(2);
const hp0 = c.hp;
M.resetCooldowns(); M.mana = 100;
out.fireCast = M.cast('fire').ok;
tick(30);
out.fire = { hp0, hp1: c.hp, dmg: +(hp0 - c.hp).toFixed(1) };
g.creatures.hostRemove(c.id);
M.resetCooldowns(); M.mana = 100;
out.hush = { cast: M.cast('hush').ok, hushed: M.isHushed(g.selfId) };
M.resetCooldowns(); M.mana = 100;
out.lumen = { cast: M.cast('lumen').ok, emitters: [...g.lights.emitters].filter((e) => e.group === 'magic').length, lightsSame: g.scene.children.filter((o) => o.isLight).length === lightsBefore };
tick(10);

// ---- 6) final PUSH on camera (screenshot)
stand();
c = spawnAhead('crawler', 2.4);
tick(3, true);
M.resetCooldowns(); M.mana = 100;
g.sendChat('İT');
tick(4, true);
out.manaNow = Math.round(M.mana);
out.errs = errs;
return out;
