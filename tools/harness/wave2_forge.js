// Wave-2 FORGE proof (body of an async function, run by tools/harness/headless.mjs after boot).
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5257 --script tools/harness/wave2_forge.js
// Proves (host path, forced rolls): a katana climbs +1..+5 with the exact costs, melee damage grows by the +5 bonus (x1.31), the
// first overclock (Shock) opens and chains, an ascension raises the tier, a tiered creature spawns with the right HP / damage
// multipliers on top of balance.scale and drops shards, and +N / overclocks survive saveFields / loadFields / serialize.
// NOTE: written for the final round but NOT run (browser budget was cut); expect small harness-level fixes on first run.
const g = kefal.game, fg = g.forge, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { installed: !!fg, errs };
if (!fg) return R;
const F = fg.F;
const P = () => new THREE.Vector3(2 + Math.random(), 1, 2 + Math.random());
const give = (type, n = 1, opts = {}) => { const ids = []; for (let i = 0; i < n; i++) ids.push(g.items.hostSpawn(type, P(), { holder: g.selfId, ...opts })); return ids; };
const cnt = (type) => [...g.items.all()].filter((it) => it.type === type && it.holder === g.selfId).length;

// ---- setup: HQ phase, no proximity check, plenty of credits, materials
g.run.phase = 'company'; g.run.credits = 5000; fg.debug.skipNear = true;
const [katanaId] = give('katana');
give('shard_scrap', 5); give('shard_circuit', 5); give('shard_crystal', 2); give('shard_algo', 3);
await wait(200);
const it = g.items.get(katanaId);
g.player.slots[0] = katanaId; g.player.slot = 0;
R.setup = { katana: !!it, shards: { scrap: cnt('shard_scrap'), circuit: cnt('shard_circuit'), crystal: cnt('shard_crystal'), algo: cnt('shard_algo') } };

// ---- damage measurement through the real client swing (no crits)
const swingDmg = () => { const r = Math.random; Math.random = () => 0.999; g.nextSwing = 0; g.meleeSwing(it, 1); Math.random = r; return g.pendingHit?.dmg || 0; };
const dmg0 = swingDmg();

// ---- +1 .. +5 with forced rolls (success roll, [overclock pick], name-line roll)
const credits0 = g.run.credits;
fg.force(0.01, 0.5, 0.01, 0.5, 0.01, 0.5, 0.01, 0.5, 0.01, 0.0, 0.5);
const steps = [];
for (let i = 0; i < 5; i++) { fg.hostEnhance({ id: katanaId }, g.selfId); steps.push(it.plus); await wait(30); it._fgBusy = false; }
R.enhance = { steps, plus: it.plus, oc: it.oc, spent: credits0 - g.run.credits, expectedSpent: 20 + 35 + 55 + 80 + 120, left: { scrap: cnt('shard_scrap'), circuit: cnt('shard_circuit'), crystal: cnt('shard_crystal') } };
const dmg5 = swingDmg();
R.damage = { plus0: dmg0, plus5: dmg5, ratio: +(dmg5 / dmg0).toFixed(3), expected: 1.31 };

// ---- overclock: Shock chains to a neighbour
const cpos = new THREE.Vector3(6, 0.2, 6);
const a = g.creatures.hostSpawn('crawler', cpos, { tier: null }), b = g.creatures.hostSpawn('scuttler', cpos.clone().add(new THREE.Vector3(2, 0, 0)), { tier: null });
const bHp = b.hp;
g.net.request('hit', { cid: a.id, dmg: 20 });
R.shock = { oc: it.oc, neighbourHpBefore: bHp, after: b.hp, chained: b.hp < bHp };

// ---- ascension (epic katana -> legendary; forced success)
const tierBefore = it.rarity();
fg.force(0.01, 0.5);
fg.hostAscend({ id: katanaId }, g.selfId);
await wait(30);
R.ascend = { before: tierBefore, after: it.rarity(), plus: it.plus, oc: it.oc };

// ---- creature tiers: multipliers on top of balance.scale, extra affixes, drops
g.run.quotaIndex = 8;
const plain = g.creatures.hostSpawn('crawler', P(), { tier: null });
const epic = g.creatures.hostSpawn('crawler', P(), { tier: 'epic' });
const seen = [];
const send = g.net.sendTo.bind(g.net);
g.net.sendTo = (id, t, d) => { if (t === 'hurt') seen.push(d.dmg); else send(id, t, d); };
g.hostHurtPlayer(g.selfId, 10, 'test', plain.id); g.hostHurtPlayer(g.selfId, 10, 'test', epic.id);
g.net.sendTo = send;
R.creatureTier = { plainHp: plain.maxHp, epicHp: epic.maxHp, hpRatio: +(epic.maxHp / plain.maxHp).toFixed(3), expected: 2.1, hurt: seen, dmgRatio: +(seen[1] / seen[0]).toFixed(2), affixes: [epic.affix, ...(epic.fgAff || [])].filter(Boolean), xpRatio: +(epic.xp / plain.xp).toFixed(2), sp: g.creatures.serializeFor().find((s) => s.id === epic.id)?.tr };
const before = [...g.items.all()].filter((x) => x.type.startsWith('shard_')).length;
fg.force(0, 0, 0, 0);
g.creatures.damage(epic.id, 1e6, g.selfId);
await wait(60);
const dropped = [...g.items.all()].filter((x) => x.type.startsWith('shard_') && x.state === 'world').map((x) => x.type);
R.drops = { before, dropped };

// ---- caps (pure, live module)
R.caps = { q0: F.creatureTierCap(0, 100), q2: F.creatureTierCap(2, 100), q6: F.creatureTierCap(6, 0) };

// ---- persistence: save fields -> load fields -> late-join serialize
const sf = g.inventory.saveFields(it);
g.items.onEvent({ e: 'sp', id: 'fgtest1', ty: 'katana', p: [1, 1, 1], q: [0, 0, 0, 1], ...g.inventory.loadFields(sf) });
const copy = g.items.get('fgtest1');
const ser = g.items.serialize().find((s) => s.id === katanaId);
R.persist = { saved: sf, loadedPlus: copy?.plus, loadedOc: copy?.oc, serialized: { pl: ser?.pl, oc: ser?.oc }, name: F.forgeName('Katana', it.plus, it.oc) };
R.rngLog = fg.log.slice(-6);
R.errs = errs;
return R;
