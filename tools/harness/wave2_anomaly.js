// ANOMALY (wave 2) feature check for headless.mjs (body of an async function; `kefal.game`, `kefal.tick`, `THREE`).
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5255 --script tools/harness/wave2_anomaly.js --shot /tmp/anomaly.png
// Proves: exposure rises in a hot zone and decays / cleans in the ship, a mutation applies and expires, forced shrine rolls give outcomes by table,
// a thrown Cursed Die resolves from its resting face (+ every face effect), and a power-up pickup applies and expires.
// NOTE: written in the budget-freeze session and NOT executed there (only smoke_land.js was run); node tools/harness/anomaly_core.test.mjs covers the pure logic.
const g = kefal.game, A = g.anomaly, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 300)); oe(...a); };
const tick = (n, dt = 1 / 30, render = false) => kefal.tick(n, dt, render);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { module: !!A };
if (!A) return { ...out, errs };
g.godMode = false;

// ---- land on a factory moon
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.run.quotaIndex = 2; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 14; i++) { tick(10); await sleep(10); }
const fac = g.world.facility;
out.dbg0 = A.debug();

// ---- 1) STATIC: rises in a hot zone, decays in the ship
const zones = A.static.zones();
out.zones = zones.map((z) => ({ type: z.type, base: z.base }));
const z = zones[0];
if (z) {
  const c = new THREE.Vector3((z.x0 + z.x1) / 2, z.y0 + 0.2, (z.z0 + z.z1) / 2);
  g.player.teleport(c);
  g.player.inShip = false;
  A.setExposure(0);
  tick(90);   // 3 s in the room
  out.riseInZone = { exposure: +A.exposure.toFixed(2), rate: +A.static.rate.toFixed(2), stage: A.stage };
  A.setExposure(60); tick(3);
  out.stage60 = A.stage;                       // Glitching (2)
  out.maxHpAtGlitch = g.stats.maxHp;           // 100 - 15 (+ level bonuses)
}
g.player.teleport(new THREE.Vector3(0, 0.2, 0));
g.player.inShip = true;
A.setExposure(60);
tick(90);
out.decayInShip = { exposure: +A.exposure.toFixed(2), expected: '~51 (3/s for 3 s)' };
A.setExposure(0);

// ---- 2) mutation applies and expires
const spd0 = g.stats.speedMul;
A.grant('m_legs', 30);
tick(2);
out.legs = { has: A.has('m_legs'), speedUp: +(g.stats.speedMul - spd0).toFixed(3) };
A.buffs.get('m_legs').until = g.time - 1;
tick(4);
out.legsExpired = !A.has('m_legs');
A.grant('b_mute', 30); tick(2);
out.mute = A.muted();
A.clear();

// ---- 3) shrine rolls by table (forced natural rolls)
const px = g.world.facility.scrapSpots.find((s) => !s.elevated);
const sh = A.dice.spawnShrine(new THREE.Vector3(px.x, px.y, px.z), 0);
g.player.teleport(new THREE.Vector3(px.x + 2.2, px.y + 0.2, px.z), Math.PI / 2);
g.player.inShip = false;
g.run.credits = 900;
const rolls = [];
for (const nat of [12, 1, 20]) {
  A.dice.forceNat(nat);
  g.net.request('an', { op: 'gamble', off: 'cr' });
  for (let i = 0; i < 7; i++) { tick(40); await sleep(900); }
  const lo = A.dice.lastOutcome;
  rolls.push({ nat, res: lo?.res, band: lo?.band, muts: (lo?.muts || []).map((m) => m[0]), pus: (lo?.pus || []).map((m) => m[0]), mimic: !!lo?.mimic, spawn: lo?.spawn?.type || null, active: A.buffs.list().map((b) => b.id), rollsUsed: A.dice.shrine?.rolls });
  A.clear();
}
A.dice.forceNat(null);
out.shrineRolls = rolls;
out.shrineOK = rolls[0]?.band === 'buff' && rolls[1]?.band === 'curse' && rolls[1]?.mimic && rolls[2]?.band === 'mythic' && rolls[2]?.spawn;
A.dice.spawnShrine(new THREE.Vector3(px.x, px.y, px.z), 0);   // reset for the screenshot

// ---- 4) Cursed Die: a thrown die resolves from its resting face; every face effect
const base = new THREE.Vector3(px.x - 2.5, px.y + 1.4, px.z);
const id = g.items.hostSpawn('cursed_die', base, { linvel: [1.5, 1, 0.5] });
for (let i = 0; i < 60; i++) { tick(20); await sleep(60); if (A.dice.lastDie) break; }
const it = g.items.get(id);
out.die = it ? { faceLogged: A.dice.lastDie?.face || null, restedFlat: !!A.dice.lastDie } : { removed: true };
const hp0 = g.player.hp = 50;
A.dice.dieEffect(4, new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z), g.selfId);
await sleep(80); tick(3);
out.dieHeal = { hp0, hp1: g.player.hp };
A.setExposure(10);
A.dice.dieEffect(6, new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z), g.selfId);
await sleep(80); tick(3);
out.dieBurst = { exposure: +A.exposure.toFixed(1), jitter: A.has('b_jitter') };
A.clear(); A.setExposure(0);
A.dice.dieEffect(5, new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z), g.selfId);
await sleep(80); tick(3);
out.dieSpeed = A.has('m_legs');
A.clear();

// ---- 5) power-up pickup applies and expires
const pp = g.player.pos;
A.powerups.hostDrop(new THREE.Vector3(pp.x, pp.y, pp.z), 'p_oc', 0);
await sleep(50); tick(2);
out.pickupSpawned = A.powerups.pickups().length;
tick(30); await sleep(100); tick(6);
out.pickup = { applied: A.has('p_oc'), left: A.buffs.get('p_oc') ? +(A.buffs.get('p_oc').until - g.time).toFixed(1) : null, pickupsLeft: A.powerups.pickups().length };
A.buffs.get('p_oc') && (A.buffs.get('p_oc').until = g.time - 1);
tick(4);
out.pickupExpired = !A.has('p_oc');

// ---- 6) DELETED collapse is cancellable (Cloud Save) and lethal otherwise
A.grant('p_cloud', 0); A.setExposure(100); tick(240);
out.cloud = { alive: !g.player.dead, exposure: +A.exposure.toFixed(0), cloudLeft: A.has('p_cloud') };
A.clear();

out.final = A.debug();
out.errs = errs;
return out;
