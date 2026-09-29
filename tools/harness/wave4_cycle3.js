// Body for headless.mjs (wave 4, module cycle3): trophies + case dossier card, Elevator Stop (ride -> stop -> fuse -> arrive), a RED + HIDDEN Glitch Gate (landing, sealed exit, sanctum statues).
// Ends with the player standing in front of the Trophy Wall (the screenshot). Usage:
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5183 --script tools/harness/wave4_cycle3.js --shot /tmp/c3.png --wait 4000
const g = kefal.game, T = window.THREE, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10) => { for (let i = 0; i < n; i++) { kefal.tick(10, 1 / 30, false); await sleep(4); } };
const stage = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e.stack || e).slice(0, 600) }; } };
const { MOONS } = await import('/src/game/moons.js');
const { sectorMoons } = await import('/src/game/moongen.js');
const C3 = g.cycle3.C3, K = g.cycle3.K;
out.installed = { cycle3: !!g.cycle3, trophy: !!g.cycle3?.trophy, gates: !!g.cycle3?.gates, elevator: !!g.cycle3?.elevator, puzzle: !!g.cycle3?.puzzle, caseFiles: !!g.cycle3?.caseFiles, c3: g.run.c3?.v };

await stage('trophy', async () => {
  const tr = g.cycle3.trophy;
  for (const [id, t] of [['foreman', 210], ['loadbalancer', 305], ['hydra', 260], ['raid', 900], ['hidden', 120]]) tr.record({ id, src: 'core', t, lvl: id === 'raid' ? 'heroic' : undefined });
  await tick(6);
  const cine = document.querySelector('.lcase-cine .c3case');
  const cardText = cine ? cine.innerText.slice(0, 160) : null;
  document.querySelectorAll('.lcase-cine').forEach((x) => x.remove());
  if (g.ui?.cineQ) g.ui.cineQ.length = 0;
  return { wallChildren: tr.wall?.children.length, mounted: Object.keys(g.run.c3.trophies), profile: Object.keys(g.profile.cycle3?.trophies || {}), dossiers: (g.profile.caseFiles || []).filter((x) => x.kind === 'cycle').map((x) => x.cycle.key), cardText };
});

const land = async (moon) => {
  g.run.daysLeft = 3; g.run.moon = moon; g.run.forecast[moon] = 'clear'; g.player.inShip = true;
  g.hostLever(g.selfId); g.hostFinishLanding(); await tick(20);
};
const leave = async () => {
  g.player.teleport(new T.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(6);
};

await stage('elevator', async () => {
  await land('hamsi');
  const E = g.cycle3.elevator;
  E.forceExists = true; await tick(3);
  const plan = E.plan;
  if (!plan) return { plan: false };
  const r = { plan: true, doors: E.plan && !!g.scene.getObjectByName('c3_elevator_doors'), apart: Math.hypot(plan.a.front.x - plan.b.front.x, plan.a.front.z - plan.b.front.z) | 0 };
  g.player.teleport(new T.Vector3(plan.a.front.x, plan.y + 0.1, plan.a.front.z));
  await tick(2);
  const list = g.interactablesNow ? g.interactablesNow() : [];
  r.callPrompt = list.some((x) => /freight elevator/.test(typeof x.label === 'function' ? x.label() : x.label));
  E.start('a', { stops: true });
  await sleep(600); await tick(3);
  r.inCab = { x: Math.round(g.player.pos.x), y: Math.round(g.player.pos.y), cab: !!E.cab, rider: E.state?.riders?.includes(g.selfId) };
  const sim = E.ride.sim; if (!sim.stops) { sim.stops = true; sim.rideT = 0.1; }
  for (let i = 0; i < 25 && sim.phase !== 'stopped'; i++) await tick(2);
  r.phase = sim.phase; r.seq = sim.seq.slice();
  const l2 = []; g.mods.emit('interactables', l2, g);
  r.cabPrompts = l2.filter((x) => /button|Brace/.test(typeof x.label === 'function' ? x.label() : x.label)).length;
  g.net.request('c3req', { op: 'ebrace' });
  for (const i of sim.seq) { g.net.request('c3req', { op: 'ebtn', i }); await tick(1); }
  await tick(2);
  for (let i = 0; i < 20 && E.ride; i++) await tick(2);
  await sleep(1000); await tick(3);
  r.arrived = !E.ride; r.ok = sim.ok; r.at = { x: Math.round(g.player.pos.x), z: Math.round(g.player.pos.z), nearB: Math.hypot(g.player.pos.x - plan.b.front.x, g.player.pos.z - plan.b.front.z) < 4 };
  r.cabGone = !E.cab;
  await leave();
  return r;
});

await stage('redHiddenGate', async () => {
  g.run.quotaIndex = 3; g.run.day = 5;
  const c = C3.ensure();
  const moons = K.sectorInteriors(sectorMoons().filter((m) => m.interior && !m.instance));
  const gate = K.rollGate({ runKey: String(g.run.runId), day: g.run.day, q: 3, gates: c.gates, moons, force: { rank: 'C', red: true, hidden: true } });
  gate.found = true;
  c.gates = K.addGate(c.gates, gate, g.run.day); C3.push();
  g.net.request('c3req', { op: 'gate', n: gate.n });
  await tick(2);
  const r = { armed: g.run.cycle.inst?.kind === 'gate' && g.run.cycle.inst.red === true, moon: g.run.moon, def: !!MOONS[g.run.moon]?.gate };
  await land(g.run.moon);
  const cur = g.cycle.inst.cur;
  r.landed = g.run.phase === 'moon' && cur?.kind === 'gate';
  const L = g.world.facility?.layout;
  r.layout = L ? { wings: L.wings.length, mazes: L.mazes.length, arena: !!L.arena } : null;
  r.boss = [...g.creatures.host.values()].filter((x) => !x.dead && x.def.boss).map((x) => x.type + ':' + x.maxHp);
  const S = g.run.c3live?.sanctum;
  r.sanctum = S ? { statues: S.statues.map((s) => s.id), rules: S.plaque.rules.map((x) => x.n) } : null;
  r.sanctDrawn = !!g.cycle3.gates.sanct && g.cycle3.gates.sanct.group.children.length;
  if (S) {
    const at = (id) => S.statues.find((s) => s.id === id);
    const touch = async (id) => { const s = at(id); g.player.teleport(new T.Vector3(s.x, S.y + 0.1, s.z + 1)); await tick(1); g.net.request('c3req', { op: 'statue', s: id }); await tick(2); return g.run.c3live?.sanctum?.prog; };
    r.wrongProg = await touch('viewers');
    r.p1 = await touch('algo'); r.p2 = await touch('viewers'); r.p3 = await touch('alive');
    r.solved = g.run.c3live?.sanctum?.solved;
    r.mythicItems = [...g.items.all()].filter((it) => it.state === 'world' && it.affix?.rarity === 'legendary').length;
    r.hiddenTrophy = !!g.run.c3.trophies.hidden;
  }
  g.player.inShip = true;
  const before = g.run.phase; g.hostLever(g.selfId); await tick(2);
  r.sealed = before === 'moon' && g.run.phase === 'moon';
  const boss = [...g.creatures.host.values()].find((x) => !x.dead && cur && cur.bosses.some((b) => b.id === x.id && b.role === 'final'));
  if (boss) { g.creatures.damage(boss.id, 1e9, g.selfId, {}); await tick(4); }
  r.finalDead = !!cur?.finalDead;
  await leave();
  r.gateState = g.run.c3.gates.list.find((x) => x.n === gate.n)?.state;
  return r;
});

await stage('wall', async () => {
  g.player.teleport(new T.Vector3(-2.4, 1.0, -0.9), Math.PI);
  g.player.pitch = 0.12; g.player.yaw = Math.PI;
  await tick(3);
  const near = []; g.mods.emit('interactables', near, g);
  return { phase: g.run.phase, wallPrompt: near.some((x) => /Trophy|mount/i.test(typeof x.label === 'function' ? x.label() : x.label)), wallVisible: g.cycle3.trophy.wall?.parent === g.scene };
});
kefal.tick(2, 1 / 30, true);
out.errs = errs;
return out;
