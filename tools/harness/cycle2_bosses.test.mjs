// node tools/harness/cycle2_bosses.test.mjs - the Sector Cycle bosses (src/game/cycle_bosses.js) driven by the REAL CreatureManager with a fake game:
// engagement, telegraphed abilities, per-boss mechanics (Load Balancer nodes, Middle Manager meeting + paper, Hydra heads/replies/regrow),
// generic kits (surgeon pull, host blink, excavator quake, lobby manager dark, key holder charge), kill hook, HP formula, no exceptions.
import * as THREE from 'three';
import { CreatureManager } from '../../src/entities/creatures.js';
import { CREATURES } from '../../src/game/creatures.js';
import { installCycleBosses, _internals } from '../../src/game/cycle_bosses.js';
import { bossHpFor } from '../../src/game/cycle_plan.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const errs = [];
const origErr = console.error;
console.error = (...a) => { errs.push(a.map(String).join(' ')); };

function makeGame(nPlayers = 3) {
  const log = { hurt: [], slow: [], hold: [], net: [], sys: [] };
  const players = [];
  const g = {
    isHost: true, time: 0, selfId: 'p0', run: { phase: 'moon', quotaIndex: 0 },
    engine: { scene: { add() {}, remove() {} }, shake() {}, flash() {} },
    net: { broadcast(t, d) { log.net.push([t, d]); if (t === 'sys') log.sys.push(d); }, sendTo() {}, sendRows() {} },
    world: { facility: { layout: { y: -300 }, doors: [], nav: {
      walkableAt: () => true, nearestWalkable: (x, z) => [x, z], toGrid: (x, z) => [x, z], toWorld: (x, z) => ({ x, z }),
      randomWalkable: (rng, x, z, r) => ({ x: x + (rng() - 0.5) * r, z: z + (rng() - 0.5) * r }), findPath: (x0, z0, x1, z1) => [{ x: x1, z: z1 }],
    } } },
    physics: { lineOfSight: () => true },
    remotes: new Map(), player: { hp: 100 },
    aiPlayers: () => players, aiPlayerById: (id) => players.find((p) => p.id === id), playerName: (id) => id,
    hostHurtPlayer(id, dmg, cause) { log.hurt.push({ id, dmg, cause }); }, hostSlowPlayer(id, t) { log.slow.push({ id, t }); }, hostHoldPlayer(id) { log.hold.push(id); },
    hostOnCreatureKilled() {}, later: (fn, ms) => setTimeout(fn, ms), isLitByFlashlight: () => false,
    mods: null, items: {}, hostData: {},
  };
  for (let i = 0; i < nPlayers; i++) {
    const a = (i / nPlayers) * Math.PI * 2;
    players.push({ id: 'p' + i, pos: new THREE.Vector3(Math.cos(a) * 9, -300, Math.sin(a) * 9), eye: new THREE.Vector3(0, -298, 0), look: new THREE.Vector3(0, 0, 1), dead: false, inShip: false, zone: 'in', crouch: false });
    g.remotes.set('p' + i, { hp: 100 - i * 10 });
  }
  g.player.hp = 100;
  g.creatures = new CreatureManager(g);
  return { g, log, players };
}
const tick = (g, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) { g.time += dt; g.creatures.hostUpdate(dt); } };
const alive = (M, type) => [...M.host.values()].filter((c) => c.type === type && !c.dead);
const hit = (g, c, amt, by = 'p0') => g.creatures.damage(c.id, amt, by, {});
const kills = [];

// ---------------------------------------------------------------- HP formula
{
  const { g } = makeGame();
  const B = installCycleBosses(g, { onBossKilled: (c) => kills.push(c.type) });
  const c1 = B.spawnBoss('middlemanager', new THREE.Vector3(0, -300, 0), { sector: 0, crew: 1, lair: { cx: 0, cz: 0, r: 8 } });
  ok(c1 && c1.maxHp === bossHpFor({ hp: 1200 }, { sector: 0, crew: 1 }), `sector 0 solo HP = base (${c1?.maxHp})`);
  const c2 = B.spawnBoss('middlemanager', new THREE.Vector3(0, -300, 0), { sector: 2, crew: 4, lair: { cx: 0, cz: 0, r: 8 } });
  ok(c2.maxHp === Math.round(1200 * 1.7 * 2.5), `sector 2 crew 4 HP = 1200 x 1.7 x 2.5 (${c2.maxHp})`);
  const c3 = B.spawnBoss('hydra', new THREE.Vector3(0, -300, 0), { sector: 1, crew: 8, raid: true, hpMul: 1.7, lair: { cx: 0, cz: 0, r: 8 } });
  ok(c3.maxHp === bossHpFor({ hp: 1400 }, { sector: 1, crew: 8, raid: true, hpMul: 1.7 }), `raid crew 8 heroic HP (${c3.maxHp})`);
  ok(CREATURES.hydra.hp === 1400, 'the shared creature def is restored after spawning');
  ok(c1.dmg > 0 && c1.def.boss && c1.def.cyBoss, 'boss damage set, def flagged');
}

// ---------------------------------------------------------------- LOAD BALANCER
{
  const { g, log, players } = makeGame(3);
  const B = installCycleBosses(g, { onBossKilled: (c) => kills.push(c.type) });
  const lb = B.spawnBoss('loadbalancer', new THREE.Vector3(0, -300, 0), { sector: 0, crew: 3, lair: { cx: 0, cz: 0, r: 9 } });
  tick(g, 0.2);
  let nodes = alive(g.creatures, 'lbnode');
  ok(nodes.length === 3, `3 server nodes at sector 0 (${nodes.length})`);
  ok(lb.data.aux.length === 3 && lb.data.auxTotal === 3, 'nodes tracked as aux');
  tick(g, 2.5);
  ok(lb.data.engaged, 'engages a crew inside the arena');
  ok(log.net.some(([t, d]) => t === 'cyx' && d.k === 'card' && d.ty === 'loadbalancer'), 'name card broadcast on engage');
  const before = lb.hp;
  hit(g, lb, 100);
  ok(Math.abs((before - lb.hp) - 100 * (0.2 + 0.8 * 0)) < 0.01, `all nodes alive: 80% damage prevented (${(before - lb.hp).toFixed(1)})`);
  hit(g, nodes[0], 9999); tick(g, 0.1);
  nodes = alive(g.creatures, 'lbnode');
  ok(nodes.length === 2, 'a node can be destroyed');
  const b2 = lb.hp; hit(g, lb, 100);
  ok(Math.abs((b2 - lb.hp) - 100 * (0.2 + 0.8 * (1 / 3))) < 0.01, `1/3 nodes down -> ${(b2 - lb.hp).toFixed(1)} damage`);
  for (const n of nodes) hit(g, n, 9999);
  tick(g, 0.2);
  ok(alive(g.creatures, 'lbnode').length === 0 && (lb.extra & 4) === 4, 'all nodes down -> vulnerable flag set');
  const b3 = lb.hp; hit(g, lb, 100);
  ok(Math.abs((b3 - lb.hp) - 100) < 0.01, 'all nodes down: full damage');
  // the route attack hits the weakest player (p2 has 80 HP)
  log.hurt.length = 0;
  tick(g, 30);
  ok(log.hurt.length > 0, 'the boss attacks (route / throttle / melee)');
  ok(lb.data.cd.route !== undefined, 'abilities on cooldown timers');
  hit(g, lb, 1e9);
  ok(lb.dead && kills.includes('loadbalancer'), 'kill hook fires for the boss');
  void players;
}

// ---------------------------------------------------------------- MIDDLE MANAGER
{
  const { g, log, players } = makeGame(3);
  const B = installCycleBosses(g, { onBossKilled: (c) => kills.push(c.type) });
  const mm = B.spawnBoss('middlemanager', new THREE.Vector3(0, -300, 0), { sector: 1, crew: 3, lair: { cx: 0, cz: 0, r: 9 } });
  tick(g, 0.2);
  ok(alive(g.creatures, 'mmpaper').length === 3, '3 paper shields orbit the manager');
  tick(g, 1.6);
  ok(mm.data.engaged, 'engaged');
  const h0 = mm.hp; hit(g, mm, 100);
  ok(Math.abs((h0 - mm.hp) - 35) < 0.01, `shielded: 35% damage (${(h0 - mm.hp).toFixed(1)})`);
  for (const p of alive(g.creatures, 'mmpaper')) hit(g, p, 999);
  tick(g, 0.1);
  const h1 = mm.hp; hit(g, mm, 100);
  ok(Math.abs((h1 - mm.hp) - 100) < 0.01, 'no shields: full damage');
  // run long enough for a meeting to be called; nobody moves into the circle -> everyone outside is punished
  log.hurt.length = 0;
  let sawMeeting = false;
  for (let t = 0; t < 60 && !sawMeeting; t += 0.05) { g.time += 0.05; g.creatures.hostUpdate(0.05); if (mm.data.meet) sawMeeting = true; }
  ok(sawMeeting, 'a mandatory meeting is called');
  tick(g, 0.1);
  const vulnDuring = mm.data.meet ? mm.data.takeMul : 0;
  ok(vulnDuring === 1.5, `distracted during the meeting: x1.5 damage (${vulnDuring})`);
  log.hurt.length = 0;
  tick(g, 8.5);
  ok(!mm.data.meet, 'meeting ends');
  ok(log.hurt.filter((h) => h.dmg >= Math.round(mm.dmg * 1.1)).length >= 1, 'players outside the circle are written up');
  // a player standing in the circle is spared
  const m = mm.data;
  m.cd.meeting = 0; m.cd.memo = 99;
  let met = false;
  for (let t = 0; t < 30 && !met; t += 0.05) { g.time += 0.05; g.creatures.hostUpdate(0.05); if (m.meet) met = true; }
  if (met) {
    players[0].pos.set(m.meet.x, -300, m.meet.z);
    log.hurt.length = 0;
    tick(g, 8);
    ok(!log.hurt.some((h) => h.id === 'p0' && h.dmg >= Math.round(mm.dmg * 1.1)), 'attendee inside the circle is not punished');
  } else ok(false, 'second meeting');
  void players;
}

// ---------------------------------------------------------------- HYDRA
{
  const { g, log } = makeGame(3);
  const B = installCycleBosses(g, { onBossKilled: (c) => kills.push(c.type) });
  const hy = B.spawnBoss('hydra', new THREE.Vector3(0, -300, 0), { sector: 0, crew: 3, lair: { cx: 0, cz: 0, r: 9 } });
  tick(g, 0.2);
  ok(alive(g.creatures, 'hydrahead').length === 3, '3 heads at sector 0');
  tick(g, 1.5);
  const h0 = hy.hp; hit(g, hy, 100);
  ok(Math.abs((h0 - hy.hp) - 12) < 0.01, `root is nearly immune while heads live (${(h0 - hy.hp).toFixed(1)})`);
  const heads = alive(g.creatures, 'hydrahead');
  hit(g, heads[0], 9999); tick(g, 0.2);
  ok(alive(g.creatures, 'hydrahead').length === 2, 'a head can be cut');
  ok(alive(g.creatures, 'hydrareply').length === 2, 'a cut head spawns TWO replies');
  ok((hy.data.regrow || []).length === 1, 'a regrow timer is queued (root alive)');
  for (const h of alive(g.creatures, 'hydrahead')) hit(g, h, 9999);
  tick(g, 0.2);
  ok((hy.extra & 4) === 4, 'no heads -> root exposed');
  const h1 = hy.hp; hit(g, hy, 100);
  ok(Math.abs((h1 - hy.hp) - 100) < 0.01, 'root takes full damage when exposed');
  tick(g, 15.5);
  ok(alive(g.creatures, 'hydrahead').length >= 1, 'heads grow back after ~14 s');
  // phase 2: sector >= 3 adds a fourth head (and the second phase exists)
  const g2 = makeGame(3);
  const B2 = installCycleBosses(g2.g, {});
  const hy2 = B2.spawnBoss('hydra', new THREE.Vector3(0, -300, 0), { sector: 3, crew: 3, lair: { cx: 0, cz: 0, r: 9 } });
  tick(g2.g, 0.2);
  ok(alive(g2.g.creatures, 'hydrahead').length === 4, '4 heads from sector 3');
  tick(g2.g, 2);
  hit(g2.g, hy2, hy2.hp * 0.55 / 0.12 / 1);   // takeMul .12 -> bring it under half
  tick(g2.g, 0.3);
  ok(hy2.data.p2, 'phase 2 at 50% HP from sector 3');
  void log;
}

// ---------------------------------------------------------------- generic kits
for (const type of ['surgeon', 'host', 'excavator', 'lobbymanager', 'keyholder']) {
  const { g, log, players } = makeGame(3);
  const B = installCycleBosses(g, { onBossKilled: (c) => kills.push(c.type) });
  const b = B.spawnBoss(type, new THREE.Vector3(0, -300, 0), { sector: 1, crew: 3, lair: { cx: 0, cz: 0, r: 9 } });
  tick(g, 60);
  ok(b.data.engaged, `${type}: engages`);
  ok(log.hurt.length > 0, `${type}: hurts the crew (${log.hurt.length} hits)`);
  if (type === 'surgeon') ok(log.hold.length > 0 || log.hurt.some((h) => h.cause === 'surgeon'), 'surgeon: pull / attacks happen');
  if (type === 'lobbymanager') ok(log.net.some(([t, d]) => t === 'cyx' && d.k === 'dark') || b.data.cd.dark > 0, 'lobby manager: lights-out ability used');
  b.stunT = 5; b.setState('stunned');
  ok(b.stunT === 0 && b.state !== 'stunned', `${type}: stun immune`);
  hit(g, b, 1e9);
  ok(b.dead && kills.includes(type), `${type}: dies and fires the kill hook`);
  void players;
}
// evade after everyone leaves: the boss heals and stops ignoring damage once home
{
  const { g, players } = makeGame(2);
  const B = installCycleBosses(g, {});
  const b = B.spawnBoss('keyholder', new THREE.Vector3(0, -300, 0), { sector: 0, crew: 2, lair: { cx: 0, cz: 0, r: 9 } });
  tick(g, 3);
  hit(g, b, 100);
  for (const p of players) p.inShip = true;
  tick(g, 12);
  ok(!b.data.engaged, 'boss disengages when the crew is gone');
  tick(g, 30);
  ok(b.hp === b.maxHp && !b.data.evade, 'boss healed and stopped evading at home');
}

// ---------------------------------------------------------------- models + UI without a DOM
{
  const fx = await import('../../src/game/cycle_bossfx.js');
  const makers = { lb: fx.createLoadBalancerModel, node: fx.createNodeModel, mm: fx.createManagerModel, paper: fx.createPaperModel, hydra: fx.createHydraModel, head: fx.createHydraHeadModel, reply: fx.createReplyModel };
  for (const [name, mk] of Object.entries(makers)) {
    const m = mk();
    for (const state of ['idle', 'walk', 'run', 'windup', 'slam', 'roar', 'attack', 'dead']) for (const progress of [0, 1, 3, 5, fx.packFlags(true, true, true, 3, 4)]) m.update(0.05, { state, speed: 3, t: 0.3, time: 12.3, progress });
    m.setHitFlash(0.8); m.setElite(true);
    ok(m.root.children.length > 0 && m.height > 0 && m.radius > 0, `model ${name}: builds, animates in every state`);
    m.dispose();
  }
  const g = makeGame().g;
  const ui = fx.createBossUi(g, (t) => ({ title: 't', rank: 'A' }));
  ui.update(0.1); ui.onMsg({ k: 'ring', p: [0, 0, 0], r: 3, t: 1 }, 'p0'); ui.onMsg({ k: 'card', ty: 'hydra' }, 'p0'); ui.update(0.5); ui.dispose();
  ok(true, 'boss UI layer is DOM-safe (no document)');
  ok(fx.packFlags(true, true, true, 3, 4) === (1 | 2 | 4 | (3 << 3) | (4 << 7)) && fx.auxAlive(fx.packFlags(true, false, false, 3, 4)) === 3 && fx.auxTotal(fx.packFlags(false, false, false, 3, 9)) === 9, 'flag packing');
}

console.error = origErr;
ok(errs.length === 0, 'no exceptions logged by the boss engine' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
console.log('all boss checks passed');
void _internals;
