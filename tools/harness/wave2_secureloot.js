// Browser proof for SECURED LOOT (NOT RUN in the wave-2 budget freeze - written for the next session).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5270 --script tools/harness/wave2_secureloot.js
// Lands on 56K-Dialup, drops one of every container next to the player, opens each with its tool through the real request path
// (begin -> wait -> open), one crude fallback (smash), one drill run with a forced jam that is fixed. Prints per-step results.
const g = kefal.game, errs = [], out = { steps: [] };
addEventListener('error', (e) => errs.push(e.message));
const step = (name, ok, extra) => out.steps.push({ name, ok: !!ok, ...extra });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (sec) => { for (let i = 0; i < Math.round(sec * 30); i++) kefal.tick(1, 1 / 30, false); };

g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await wait(10); }
const S = g.secureloot;
step('module installed', !!S);
step('planned containers (quota 0: <= 1)', S.list().length <= 1, { list: S.list().map((c) => c.kind) });

const s0 = g.world.facility.scrapSpots[2];
g.player.teleport(new THREE.Vector3(s0.x, s0.y + 0.2, s0.z)); tick(1);
const base = new THREE.Vector3(s0.x, s0.y, s0.z);
const give = (type, opts = {}) => { const id = g.items.hostSpawn(type, base.clone().add(new THREE.Vector3(0, 0.6, 0)), { holder: g.selfId, ...opts }); tick(0.2); return id; };
const spawn = (kind, variant, i) => S.debugSpawn(kind, variant, base.clone().add(new THREE.Vector3(3 + i * 2.2, 0, 0)), 0);
const kinds = [['case', null], ['safe', 'wall'], ['safe', 'floor'], ['cage', 'cage'], ['cage', 'locker'], ['lockbox', null], ['vault', null]];
const cs = kinds.map(([k, v], i) => spawn(k, v, i));
step('one of each container spawned', cs.every(Boolean), { ids: cs.map((c) => c?.id) });
const by = (k, v) => cs.find((c) => c.kind === k && (!v || c.variant === v));
const req = (op, extra) => g.net.request('slAct', { op, s: g.secureloot.get(cs[0].id) ? g.world.seed : 0, ...extra });

// tool flows through the real host handlers (the player is within range: teleport next to each)
async function via(c, method, toolType, aux) {
  g.player.teleport(new THREE.Vector3(c.x + c.fwd.x * 1.5, c.y + 0.2, c.z + c.fwd.z * 1.5)); tick(0.3);
  const tool = toolType ? give(toolType, { charges: 6 }) : null;
  const auxId = aux ? give(aux) : null;
  const seed = g.world.seed;
  g.net.request('slAct', { op: 'begin', s: seed, id: c.id, m: method, tool, aux: auxId });
  const m = (await import('/src/game/secureloot_core.js')).methodOf(c.kind, method);
  tick(Math.max(1.2, (m.base || 0) + 0.5));
  g.net.request('slAct', { op: 'open', s: seed, id: c.id, m: method, tool, aux: auxId });
  tick(0.5);
  return S.get(c.id).opened;
}
step('glass case + Glass Cutter', await via(by('case'), 'cutter', 'sl_glasscutter'));
step('cage + Bolt Cutters', await via(by('cage', 'cage'), 'bolt', 'sl_boltcutters'));
step('lockbox + Hack Tool (minigame path: host accepts after 1 s)', await via(by('lockbox'), 'hack', 'sl_hacktool'));
step('vault + Plasma Torch + Fuel Canister', await via(by('vault'), 'torch', 'sl_torch', 'comp_fuel'));
step('chained locker: crude bash with a shovel (60 s -> forced by shortcut)', S.open(by('cage', 'locker').id, 'bash'));   // crude path: timing enforced by the host handler, shortcut here

// drill: place, force a jam, fix it, let it finish
const safe = by('safe', 'floor');
g.player.teleport(new THREE.Vector3(safe.x + safe.fwd.x * 1.5, safe.y + 0.2, safe.z + safe.fwd.z * 1.5)); tick(0.3);
const drill = give('sl_drill', { charges: 3, tier: 'legendary' });
step('drill placed', S.drillStart(safe.id, drill));
tick(2);
step('drill jams (forced)', S.forceJam(safe.id) && S.list().find((c) => c.id === safe.id).jammed);
g.net.request('slAct', { op: 'fix', s: g.world.seed, id: safe.id });
tick(1);
step('jam fixed', !S.list().find((c) => c.id === safe.id).jammed);
tick(50);   // Legendary drill: 46 s
step('drill finished, safe open', S.get(safe.id).opened);
const back = [...g.items.all()].filter((it) => it.type === 'sl_drill' && it.state === 'world');
step('the drill came back with one charge less', back.length === 1 && back[0].charges === 2, { charges: back[0]?.charges });
out.threat = g.balance?.threat?.();
out.errs = errs;
return out;
