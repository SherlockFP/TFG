// Wave-1 CRAFTING proof (body of an async function, run by tools/harness/headless.mjs after boot).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5187 --script tools/harness/wave1_crafting.js --shot /tmp/crafting.png
// --url modes: `&crflite=1` skips the proof sections (icons + workbench overlap check only); `&crfbench=1` frames the workbench 3D close-up instead of the panel.
// Proves: components spawn in a facility, a recipe crafts (consumes inputs, spawns a tiered output), dismantle yields
// components, analyze unlocks a blueprint, rollChestLoot distribution per tier, creature kills drop components.
const g = kefal.game, cr = g.crafting, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 30) => { kefal.tick(n, 1 / 30, false); await wait(380); };
const { RNG } = await import('/src/core/rng.js');
const models = await import('/src/models/components.js');
const { CREATURES } = await import('/src/game/creatures.js');
const Q = new URLSearchParams(location.search);
const LITE = Q.has('crflite');
const R = { installed: !!cr, errs };
if (!cr) return R;
const B = cr.BENCH;
const spawn = (type, n = 1) => { const ids = []; for (let i = 0; i < n; i++) ids.push(g.items.hostSpawn(type, new THREE.Vector3(B.x - 0.4 + (i % 8) * 0.11, 1.25 + Math.floor(i / 8) * 0.12, B.z + 0.05 + ((i * 7) % 3) * 0.08), {})); return ids; };
const count = (type) => [...g.items.all()].filter((it) => it.type === type && it.state === 'world').length;
const compTotals = () => { const m = {}; for (const it of g.items.all()) if (it.def.kind === 'component') m[it.type] = (m[it.type] || 0) + 1; return m; };
const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);

proof: {
if (LITE) break proof;
// ---- 0) recipes + models
R.recipes = cr.recipes().length;
R.models = { total: models.COMPONENT_MODEL_IDS.length, built: models.COMPONENT_MODEL_IDS.filter((id) => { try { return !!models.createComponentModel(id); } catch (e) { errs.push(id + ': ' + e.message); return false; } }).length };

// ---- 1) components spawn in a facility (host after populate)
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await wait(10); }
const inFac = compTotals();
R.facility = { theme: g.world.facility?.layout?.theme, components: sum(inFac), byId: inFac, populate: cr.stats.populate, strangeItems: [...g.items.all()].filter((it) => it.def.strange).map((it) => it.type) };
g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
await wait(200);
g.player.teleport(new THREE.Vector3(B.x, 0.05, B.z + 1.4), 0);
await tick();

// ---- 2) craft a Medkit: consumes cloth x2 + chem x1, spawns a medkit with a rolled tier
const got = [];
const off = cr.on((d) => got.push(d));
spawn('comp_cloth', 3); spawn('comp_chem', 2);
await tick();
const before = { cloth: count('comp_cloth'), chem: count('comp_chem'), medkit: count('medkit') };
cr.craft('medkit');
await tick();
const medkit = [...g.items.all()].find((it) => it.type === 'medkit');
R.craft = { before, after: { cloth: count('comp_cloth'), chem: count('comp_chem'), medkit: count('medkit') }, tier: medkit?.tier || null, reply: got.filter((d) => d.k === 'crafted' || d.k === 'err').map((d) => ({ k: d.k, out: d.out, tier: d.tier, msg: d.msg })) };

// ---- 3) dismantle a GPU: deterministic components
const gpu = spawn('gpu')[0];
await tick();
const c0 = compTotals();
cr.dismantle(gpu);
await tick();
const c1 = compTotals();
const gained = {}; for (const k of Object.keys(c1)) if ((c1[k] || 0) > (c0[k] || 0)) gained[k] = c1[k] - (c0[k] || 0);
R.dismantle = { gpuLeft: count('gpu'), gained, expected: cr.dismantleYield('gpu', {}) };

// ---- 4) analyze a Black Box: unlocks the EMP blueprint (profile.blueprints), then craft the EMP
const box = spawn('strange_blackbox')[0];
await tick();
const lockedBefore = cr.recipes().find((r) => r.id === 'emp')?.locked;
cr.analyze(box);
await tick();
const lockedAfter = cr.recipes().find((r) => r.id === 'emp')?.locked;
R.analyze = { boxLeft: count('strange_blackbox'), blueprints: Object.keys(g.profile.blueprints || {}), empLockedBefore: lockedBefore, empLockedAfter: lockedAfter, reply: got.filter((d) => d.k === 'analyzed').map((d) => ({ bp: d.bp, xp: d.xp })) };
spawn('comp_circuit', 2); spawn('comp_battery', 2); spawn('comp_crystal', 1);
await tick();
cr.craft('emp');
await tick();
const emp = [...g.items.all()].find((it) => it.type === 'craft_emp');
R.emp = { crafted: !!emp, tier: emp?.tier || null };

// ---- 5) weapon upgrade (pipe common -> uncommon; 95% chance, failure keeps the weapon)
g.run.credits = 400;
const pipe = spawn('pipe')[0];
spawn('comp_scrapmetal', 2); spawn('comp_cable', 1);
await tick();
cr.upgrade(pipe);
await tick();
const pipes = [...g.items.all()].filter((it) => it.type === 'pipe');
R.upgrade = { pipes: pipes.length, upgradedTier: pipes.find((p) => !p.soulbound && p.tier)?.tier || null, credits: g.run.credits, reply: got.filter((d) => d.k === 'upgraded').map((d) => ({ ok: d.ok, to: d.to })) };

// ---- 6) chest loot distribution per tier (1500 chests each, seeded)
const dist = {};
for (const tier of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
  const rng = new RNG(4242); const cat = {}, tiers = {}; let n = 0;
  for (let i = 0; i < 1500; i++) for (const e of cr.rollChestLoot(tier, rng, { theme: 'serverfarm' })) { cat[e.kind] = (cat[e.kind] || 0) + 1; tiers[e.tier] = (tiers[e.tier] || 0) + 1; n++; }
  const pc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / n * 100).toFixed(1)]));
  dist[tier] = { perChest: +(n / 1500).toFixed(2), kind: pc(cat), tier: pc(tiers) };
}
R.chestLoot = dist;

// ---- 7) drops: dropComponents + a killed creature (forced 100% chance)
R.drop = { ids: cr.dropComponents(new THREE.Vector3(B.x, 2.2, B.z + 1), 'electronic', 4).length };
CREATURES.scuttler.compDrop = { chance: 1, n: 2, kind: 'electronic' };
const cid = g.creatures.hostSpawn('scuttler', new THREE.Vector3(1, 0.5, 0), {});
await tick(4);
const cc = g.creatures.host.get(cid) || [...g.creatures.host.values()].find((c) => c.type === 'scuttler');
const k0 = sum(compTotals());
if (cc) g.creatures.kill(cc, g.selfId);
await tick(4);
R.kill = { hadCreature: !!cc, compsBefore: k0, compsAfter: sum(compTotals()) };
delete CREATURES.scuttler.compDrop;
off();

}
// ---- 8) view: panel (default) or the workbench close-up
if (LITE) {
  g.player.teleport(new THREE.Vector3(B.x, 0.05, B.z + 1.4), 0);
  const { iconURL } = await import('/src/ui/icons.js');
  const ids = [...models.COMPONENT_MODEL_IDS, 'medkit', 'stungrenade', 'flashlight', 'pipe', 'gpu'];
  ids.forEach((id) => iconURL(id));
  for (let i = 0; i < 40; i++) { await wait(500); if (ids.every((id) => iconURL(id))) break; }
  R.icons = { total: ids.length, ready: ids.filter((id) => iconURL(id)).length, missing: ids.filter((id) => !iconURL(id)) };
  // workbench footprint vs the other ship furniture
  const benchBox = new THREE.Box3().setFromObject(g.ship.group.getObjectByName('workbench'));
  const over = [];
  for (const [name, o] of Object.entries(g.ship.anchors)) { const b = new THREE.Box3().setFromObject(o); if (b.intersectsBox(benchBox)) over.push(name); }
  R.bench = { min: benchBox.min.toArray().map((v) => +v.toFixed(2)), max: benchBox.max.toArray().map((v) => +v.toFixed(2)), overlaps: over };
}
if (Q.has('crfbench')) {
  spawn('comp_scrapmetal'); spawn('comp_wood'); spawn('comp_cable'); spawn('comp_battery'); spawn('comp_fuse'); spawn('comp_circuit'); spawn('comp_sensor');
  spawn('comp_fuel'); spawn('comp_coolant'); spawn('comp_chem'); spawn('comp_cloth'); spawn('comp_crystal'); spawn('comp_ecto'); spawn('comp_accesscard');
  spawn('craft_molotov'); spawn('craft_trap'); spawn('craft_gasmask'); spawn('strange_egg');
  await tick(60);
  g.player.teleport(new THREE.Vector3(B.x - 0.1, 0.05, B.z + 1.9), 0);
  g.player.pitch = -0.28;
  kefal.tick(6, 1 / 30, true);
} else {
  spawn('comp_cloth', 4); spawn('comp_scrapmetal', 5); spawn('comp_cable', 3); spawn('comp_battery', 3); spawn('comp_circuit', 2); spawn('comp_chem', 2); spawn('comp_coolant', 2); spawn('comp_fuel', 1);
  await tick(40);
  cr.open('craft');
  await wait(2500);
  kefal.tick(4, 1 / 30, true);
}
R.errs = errs;
return R;
