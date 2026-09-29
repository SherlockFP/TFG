// Feature run for the polish4 module (headless.mjs body):  flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_polish4.js --shot out.png --wait 4000
// Checks: module loaded, start loadout (no free flashlight), egg drop -> incubator -> hatch, cantina barter host path, ship decal + furniture,
// role-skill cooldown clamp + m:ss HUD, dune maw guard, squad flank / detour wrappers installed.
const g = kefal.game, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const tick = async (n = 10) => { for (let i = 0; i < n; i++) { kefal.tick(4, 1 / 30, false); await new Promise((r) => setTimeout(r, 5)); } };
out.module = !!g.polish4 && !!g.pets && !!g.shipyard;

// ---- start loadout: nobody starts with a flashlight (buy it: store price 15)
out.startHeld = g.items.all().filter((it) => it.holder === g.selfId).map((it) => it.type);
out.flashOnShip = g.items.all().filter((it) => /flashlight/.test(it.type)).length;

// ---- land on the twin-sun desert (real cantina aliens, buried dune maws, outdoor squads)
g.run.daysLeft = 3; g.run.moon = 'w2sun'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 25; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
out.landed = { phase: g.run.phase, moon: g.run.moon, npcs: [...g.creatures.host.values()].filter((c) => c.type === 'alien_npc').length, maws: [...g.creatures.host.values()].filter((c) => c.type === 'dunemaw').length };

// ---- eggs: forced drop, then use it in the ship, then age the incubator and hatch
const p4 = g.polish4;
out.eggDrop = p4.forceEgg('pet_egg_common', V3(0.5, 1.2, 0));
await tick(8);
const egg = g.items.all().find((it) => it.type === 'pet_egg_common');
out.eggItem = !!egg;
if (egg) {
  g.player.inShip = true;
  const r = g.pets.incubateItem(egg);
  out.incubate = r.ok;
  const st = g.pets.state();
  out.incubating = st.incubator.length;
  st.clock += 5;                       // 5 game days later
  const res = g.pets.hatchCheck();
  out.hatched = res.map((x) => x.pet.sp);
}

// ---- seeded rolls: chest / kill helpers are deterministic
out.chestRoll = [p4.core.rollChestEgg({ seed: g.run.seed, day: g.run.day, id: 'c1', tier: 'void', pity: 6 }), p4.core.rollChestEgg({ seed: g.run.seed, day: g.run.day, id: 'c1', tier: 'void', pity: 6 })];

// ---- role-skill cooldown clamp (owner: 5 min / 10 min, never below 3 / 7 min) + m:ss HUD
const rs = g.combat?.roles;
if (rs) {
  rs.debugRole = 'medic';
  const realBonus = g.rpg.bonus;
  g.rpg.bonus = (k) => (k === 'cooldown' ? 0.5 : realBonus.call(g.rpg, k));
  g.player.hp = 50;
  const okBeam = rs.use(0);
  out.beamCd = Math.round((rs.cds.get('beam') || 0) - g.time);
  rs.cds.set('revive', g.time + 425);
  await tick(6);
  const cells = [...document.querySelectorAll('.rs-c span')].map((e) => e.textContent);
  out.hudText = cells;
  out.okBeam = okBeam;
  g.rpg.bonus = realBonus; rs.debugRole = null; rs.resetCooldowns();
}

// ---- ship decor: decal + furniture through the host path (we are the host)
const sy = g.profile.shipyard;
out.hasShipyardState = !!sy;
g.player.inShip = true; g.player.teleport(V3(0, 1, 0));
g.run.credits = 500;
const ph0 = g.run.phase;
p4.hostAct({ op: 'decal', id: 'star' }, g.selfId);
p4.hostAct({ op: 'place', id: 'plant', x: 2.6, z: -1.6, r: 1 }, g.selfId);
p4.hostAct({ op: 'place', id: 'rug', x: 0, z: 0, r: 0 }, g.selfId);
p4.hostAct({ op: 'place', id: 'plant', x: 2.7, z: -1.6, r: 0 }, g.selfId);   // overlaps the first plant: refused
await tick(6);
p4.syncDeco(true);
out.phase = ph0;
out.deco = { decal: g.run.sy?.deco?.decal, furn: g.run.sy?.deco?.furn?.length, group: !!p4.deco.group, meshes: p4.deco.group ? p4.deco.group.children.length : 0, credits: g.run.credits };

// ---- barter with a REAL cantina alien
const M = g.creatures;
const npc = [...M.host.values()].find((c) => c.type === 'alien_npc' && !c.dead);
if (npc) {
  g.player.teleport(V3(npc.pos.x + 1.2, npc.pos.y + 1, npc.pos.z)); g.player.inShip = false;
  await tick(4);
  const offers = p4.offersFor(npc.id);
  out.offers = offers.map((o) => `${o.kind}:${o.item}:${o.price || o.min}`);
  g.run.credits = 900;
  const before = g.items.all().length;
  const buy = offers.find((o) => o.kind === 'buy');
  p4.hostBarter({ npc: npc.id, i: buy.i }, g.selfId);
  await tick(4);
  out.barter = { credits: g.run.credits, spent: 900 - g.run.credits, price: buy.price, newItems: g.items.all().length - before };
  const nv = g.creatures.views.get(npc.id);
  out.npcViewFound = !!nv;
}
out.stats = { ...p4.state.stats };

// ---- dune maw: buried maws take no damage (real one from the desert population)
const maw = [...M.host.values()].find((c) => c.type === 'dunemaw' && !c.dead);
if (maw) {
  const hp0 = maw.hp;
  maw.state = 'hidden'; M.damage(maw.id, 50, g.selfId, {});
  out.mawHiddenDmg = hp0 - maw.hp;
  const mv = M.views.get(maw.id); out.mawViewHidden = mv ? mv.hidden : null;
  maw.state = 'exposed'; M.damage(maw.id, 50, g.selfId, {});
  out.mawExposedDmg = hp0 - maw.hp;
}

// ---- squads: flank offsets while the crew is far (raid squads use the same AI)
g.player.teleport(V3(0, 3, 40)); await tick(2);
const squad = g.horde.spawnHitSquad('bureau', V3(70, 0, 70), 4);
out.squadSize = squad.length;
if (squad.length > 1) {
  const sq = squad[0].data.squad;
  for (let k = 0; k < 40; k++) { sq.contact = { pid: g.selfId, pos: V3(0, 0, 40), t: g.time, zone: 'out' }; kefal.tick(2, 1 / 30, false); }
  out.flank = squad.map((c) => [c.type, !!c.data.p4Flank, c.data.offset ? Math.round(Math.hypot(c.data.offset.x, c.data.offset.z)) : null]);
  out.flanks = p4.state.stats.flanks; out.detours = p4.state.stats.detours;
}
out.goToWrapped = Object.prototype.hasOwnProperty.call(g.creatures, 'goTo');

// ---- PET panel: stable list with portraits + turntable (screenshot is taken of this)
try {
  const C = await import('/src/game/pets_core.js');
  const st = g.pets.state();
  while (st.stable.length < 4) { const pet = C.makePet({ sp: ['cat', 'dog', 'fox', 'owl'][st.stable.length], source: 'debug' }); C.adoptPet(st, pet); }
  g.pets.giveXp(900);
  g.run.phase = 'orbit';
  g.player.dead = false;
  const ctl = g.pets.open('stable');
  await new Promise((r) => setTimeout(r, 600));
  out.panel = { open: !!ctl, li: document.querySelectorAll('.pt-li').length, portraits: document.querySelectorAll('.pt-port img').length, studio: !!document.querySelector('.pt-stage canvas'), meters: document.querySelectorAll('.pt-meter').length };
  const box = document.querySelector('.pt')?.getBoundingClientRect();
  out.panelBox = box ? [Math.round(box.width), Math.round(box.height), Math.round(box.top)] : null;
} catch (e) { out.panelErr = String(e.stack || e).slice(0, 300); }

out.errs = errs;
return out;
