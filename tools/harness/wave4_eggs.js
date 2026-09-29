// Body for headless.mjs (wave 4 eggs): moon secrets. Lands, checks the seeded plan + models, debug-spawns every kind next to the player, drives the
// interact prompts (client) and the host handlers, checks profile persistence, draw-call cost and the light count.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5182 --script tools/harness/wave4_eggs.js --shot /tmp/eggs_moon.png --wait 4000
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const R = { errs };
const T = (n = 10) => kefal.tick(n, 1 / 30, false);
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { ITEMS } = await import('/src/game/items.js');
g.godMode = true;
g.profile.eggs = undefined;
const land = async (moonId) => {
  g.run.daysLeft = 3; g.run.moon = moonId; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 14; i++) { T(10); await wait(10); }
};
const lights = () => { let n = 0; g.engine.scene.traverse((o) => { if (o.isLight) n++; }); return n; };
R.module = !!g.eggs; R.buffDefs = ['egg_bless1', 'egg_bless2', 'egg_bless3'].every((id) => !!g.anomaly?.DEFS?.[id]);
// natural plans on a few moons (deterministic per seed)
R.natural = [];
for (const m of ['hamsi']) {
  await land(m);
  R.natural.push({ m, seed: g.world.seed, plan: g.eggs.plan().map((e) => e.kind + '@' + e.where), built: g.eggs.list().length });
  if (false) { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); T(5); }
}
// stay on the last moon; debug-spawn every kind in a row next to the player
const p = g.player.pos, terrain = g.world.outdoor.terrain, seed = g.world.seed | 0;
R.lightsBefore = lights();
const kinds = ['graffiti', 'shrine', 'vending', 'diary', 'duck', 'statue', 'payphone', 'stash'];
const spawned = {};
const base = { x: p.x, z: p.z + 8 };
kinds.forEach((k, i) => {
  const x = base.x - 12 + i * 3.4, z = base.z, y = terrain.heightAt(x, z);
  const id = g.eggs.debugSpawn(k, x, y, z, 'outdoor', 0);   // models face +z; the player looks at them from +z
  spawned[k] = { id, x, y, z };
});
T(5);
R.lightsAfter = lights();
R.calls = g.engine.renderer?.info?.render?.calls;
const near = (k) => { const s = spawned[k]; g.player.teleport(V(s.x, s.y + 0.1, s.z + 1.6)); g.player.yaw = 0; g.player.pitch = 0; T(2); };
const interact = (k) => {   // the real client prompt path
  near(k); const s = spawned[k];
  const item = g.interactablesNow().find((it) => it.pos && Math.hypot(it.pos.x - s.x, it.pos.z - s.z) < 0.5);
  if (!item) return { prompt: null };
  const label = typeof item.label === 'function' ? item.label() : item.label;
  item.action(); T(3);
  return { prompt: label };
};
const eg = () => g.profile.eggs || {};
const found = (id) => !!eg().found?.[id];
R.local = {};
for (const k of ['graffiti', 'diary', 'statue']) R.local[k] = { ...interact(k), found: found(k) };
// host-authoritative ones
R.duck = { first: interact('duck'), found: found('duck'), n: eg().n?.duck };
const dv = g.eggs.list().find((e) => e.kind === 'duck');
R.duck.goneAfter = dv?.gone; R.duck.second = interact('duck'); R.duck.nAfter = eg().n?.duck;
const nItems = () => g.items.all().length;
let n0 = nItems();
R.vending = { ...interact('vending'), found: found('vending'), spawned: nItems() - n0 }; n0 = nItems();
R.vending.again = interact('vending').prompt; R.vending.spawnedAgain = nItems() - n0;
n0 = nItems();
R.stash = { ...interact('stash'), found: found('stash'), spawned: nItems() - n0 };
R.payphone = { ...interact('payphone'), found: found('payphone') }; R.payphone.again = interact('payphone').prompt;
// shrine: needs a held scrap item
const scrap = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'scrap' && ITEMS[k].value && ITEMS[k].hands === 1);
near('shrine');
R.shrine = { emptyHanded: interact('shrine').prompt };
const iid = g.items.hostSpawn(scrap, V(p.x, p.y + 1, p.z), { holder: g.selfId });
T(4);
const held = g.items.get(iid);
R.shrine.held = !!held; R.shrine.heldValue = held?.value;
g.player.slot = g.player.slots?.indexOf(iid) >= 0 ? g.player.slots.indexOf(iid) : g.player.slot;
R.shrine.offer = interact('shrine');
R.shrine.itemGone = !g.items.get(iid); R.shrine.found = found('shrine');
R.shrine.buff = ['egg_bless1', 'egg_bless2', 'egg_bless3'].filter((id) => g.anomaly?.has?.(id));
R.shrine.again = interact('shrine').prompt;
// persistence + counters
const raw = JSON.parse(localStorage.getItem('kefal.profile.v1') || '{}');
R.persist = { foundInStorage: Object.keys(raw.eggs?.found || {}).length, ducks: raw.eggs?.n?.duck, found: Object.keys(eg().found || {}) };
// statue head turns while you do not look at it, stays frozen while you do
{
  const s = spawned.statue, m = g.eggs.model(g.eggs.list().find((e) => e.kind === 'statue').id);
  const at = (yaw) => { g.player.teleport(V(s.x, s.y + 0.1, s.z - 6)); g.player.yaw = yaw; g.player.pitch = 0; };
  at(Math.PI); T(40); const frozen0 = m.headYaw;               // looking at the statue
  T(60); const frozen1 = m.headYaw;
  at(0); T(90); const turned = m.headYaw;                       // looking away
  at(Math.PI); T(5); const h1 = m.headYaw; T(40); const h2 = m.headYaw;
  R.statue = { whileWatched: [+frozen0.toFixed(3), +frozen1.toFixed(3)], turnedWhenAway: +turned.toFixed(3), frozenAgain: [+h1.toFixed(3), +h2.toFixed(3)] };
}
R.errsFinal = errs.slice();
// camera for the screenshot: a few eggs in view
{
  const s = spawned.shrine;
  g.player.teleport(V(s.x + 4.5, s.y + 0.1, s.z + 5.5)); g.player.yaw = Math.atan2(-(s.x + 4 - (s.x + 4.5)), -(s.z - (s.z + 5.5))) - 0.35; g.player.pitch = -0.05; T(10); await wait(50); T(5);
}
return R;
