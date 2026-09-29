// QA: climb the stairs of a Soviet block (worlds2) in the real browser. Body of an async fn for headless.mjs.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave6_stairs_qa.js --shot /tmp/stairs.png --wait 4000
// Lands on w2sov, stands in front of section 0's first flight of block 0 (frame maths as in worlds2_soviet.js), holds W and reports the height gained per storey.
const g = kefal.game, T = THREE, errs = []; addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { errs };
g.run.daysLeft = 3; g.run.moon = 'w2sov'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await sleep(5); }
const info = g.world.outdoor?.decor?.info;
out.kind = info?.kind; out.blocks = info?.blocks?.length;
const b = info?.blocks?.find((k) => k.nF >= 3) || info?.blocks?.[0];
if (!b) return out;
out.block = b;
const SEC_W = 11.6, CORE = 1.6, LANE_A = -0.8, LANE_B = 0.8, FH = 3.0;
const lp = (lx, lz) => [b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot), b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot)];
const x0 = -(b.nSec * SEC_W) / 2 + SEC_W / 2;   // section 0 centre
out.flights = []; out.deaths = [];
const od = g.hostOnPlayerDied.bind(g); g.hostOnPlayerDied = (id, d) => { out.deaths.push({ id, d: JSON.stringify(d).slice(0, 160), y: +g.player.pos.y.toFixed(1) }); return od(id, d); };
g.player.inShip = false;
for (let f = 0; f < b.nF; f++) {
  const dir = f % 2 === 0 ? 1 : -1, lane = f % 2 === 0 ? LANE_A : LANE_B, base = b.y0 + FH * f;
  const start = lp(x0 + lane, dir > 0 ? -CORE - 0.8 : CORE + 0.8);
  const yaw0 = Math.atan2(-Math.sin(b.rot) * dir, -Math.cos(b.rot) * dir);   // local +z (dir>0) or -z, in world
  g.player.teleport(new T.Vector3(start[0], base + 0.1, start[1]), yaw0);
  kefal.tick(20, 1 / 30, false);
  for (const c of [...g.creatures.host.values()]) g.creatures.kill(c, null, { silent: true });
  g.player.hp = g.player.maxHp || 100; g.player.inShip = false;
  const trace = [], hps = [], hp0 = g.player.hp;
  kefal.input.down.add('KeyW');
  for (let i = 0; i < 16; i++) { kefal.tick(10, 1 / 30, false); await sleep(2); trace.push(+(g.player.pos.y - base).toFixed(2)); hps.push(Math.round(g.player.hp) + (g.player.inShip ? 's' : '')); }
  kefal.input.down.delete('KeyW');
  out.flights.push({ f, maxRise: Math.max(...trace), last: trace[trace.length - 1], hpLost: hp0 - g.player.hp, dead: !!g.player.dead, inShip: !!g.player.inShip, rises: trace.filter((_, i) => i % 3 === 0), hps: hps.filter((_, i) => i % 3 === 0) });
}
out.climbedAll = out.flights.every((x) => x.maxRise >= 2.7);
kefal.tick(3, 1 / 30, true);
return out;
