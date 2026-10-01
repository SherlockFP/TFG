// STEALTH wave 4 - sound-hunter state machine test (pure node, fake CreatureManager):  node tools/harness/stealth_listener.test.mjs
//  * a silent (sneaking) player walks past at arm's length: never noticed, never hit (only a real bump hits)
//  * a walking player is heard at ~6 m, a sprinting one at ~15 m: alert (telegraph) -> hunt at run speed -> attack
//  * a decoy (noise without a player) lures it away from a nearby quiet player: hunt -> inspect -> search -> idle
//  * a newer noise re-targets a running hunter; a hit makes it turn on the attacker; crawler cfg ramps its speed
import { soundHunter, LISTENER_CFG, CRAWLER_CFG, LISTENER_DEF } from '../../src/game/stealth_creatures.js';
import { CREATURES, registerCreature } from '../../src/game/creatures.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

class FakeM {
  constructor() { this.game = { time: 0, stealth: { inspected: 0, onInspect() { this.inspected++; } } }; this.noises = []; this.players = []; this.hits = []; }
  playersFor() { return this.players; }
  hear(c, r) { let best = null, bl = 0; for (const n of this.noises) { const h = n.loud * r - flat(n.pos, c.pos); if (h > 0 && h > bl) { bl = h; best = n; } } return best; }
  goTo(c, x, z) { c.dest = { x, z }; c.path = [{ x, z }]; c.pathIdx = 0; }
  goToLazy(c, x, z, tol = 2) { if (c.dest && flat(c.dest, { x, z }) < tol && c.pathIdx < c.path.length) return; this.goTo(c, x, z); }
  follow(c, dt, sp) {
    if (!c.path || c.pathIdx >= c.path.length) return true;
    const wp = c.path[c.pathIdx], d = flat(wp, c.pos);
    if (d < 0.35) { c.pathIdx++; return c.pathIdx >= c.path.length; }
    const st = Math.min(d, sp * dt);
    c.pos.x += ((wp.x - c.pos.x) / d) * st; c.pos.z += ((wp.z - c.pos.z) / d) * st;
    c.travelled += st;
    return false;
  }
  wander(c, r) { this.goTo(c, c.pos.x + (Math.random() - 0.5) * r, c.pos.z + (Math.random() - 0.5) * r); }
  attack(c, p, dmg) { this.hits.push({ by: c.id, to: p.id, t: this.game.time }); }
}
function mk(def, x = 0, z = 0) {
  const c = { id: 'c1', type: 'listener', def, data: {}, pos: { x, y: 0, z }, yaw: 0, state: 'idle', t: 0, cooldown: 0, dmg: 55, target: null, path: null, pathIdx: 0, dest: null, travelled: 0 };
  c.setState = (s) => { if (s !== c.state) { c.state = s; c.t = 0; } };
  return c;
}
const player = (id, x, z, noise = 0.3) => ({ id, pos: { x, y: 0, z }, eye: { x, y: 1.6, z }, noise, voice: 0, inShip: false, dead: false, crouch: false });
function tick(M, c, beh, dt = 0.05) { M.game.time += dt; c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); beh(c, dt, M); }
function stepPlayerNoise(M, p) { M.noises = M.noises.filter((n) => n.owner !== p.id && n.owner !== undefined || n.owner === null); if (p.noise > 0.08) M.noises.push({ pos: { x: p.pos.x, z: p.pos.z, y: 0 }, loud: p.noise, owner: p.id }); }
function noiseOf(p) { return { pos: { ...p.pos }, loud: p.noise, owner: p.id }; }

const L = registerCreature('listener', { ...LISTENER_DEF });
ok(CREATURES.listener && CREATURES.listener.walk < 2 && CREATURES.listener.run > 7 && CREATURES.listener.run < 8.2, 'listener: slow when idle, fast when hunting');
const beh = soundHunter(LISTENER_CFG);

// 1. silent player passes at 2.5 m, then even at 1.4 m: not noticed, no hit
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', -12, 2.5, 0.02);
  M.players.push(p);
  let maxState = 'idle', hunted = false;
  for (let i = 0; i < 20 * 30; i++) {                       // 30 s: the player sneaks along z = 2.5 at 2.1 m/s
    p.pos.x += 2.1 * 0.05; p.eye.x = p.pos.x;
    M.noises = [noiseOf(p)];                              // the host would push a noise entry every tick (loud 0.02: heard at < 0.5 m)
    tick(M, c, beh);
    if (c.state === 'hunt' || c.state === 'attack' || c.state === 'alert') hunted = true;
    // the listener might wander (roam) but stays put here: reset its roam target so it does not walk into the player
    if (c.state === 'walk') { c.state = 'idle'; c.t = 0; c.path = null; }
  }
  ok(!hunted && M.hits.length === 0, 'silent player at 2.5 m is ignored (no alert, no hit)');
}
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', -6, 1.4, 0.02);
  M.players.push(p);
  let seen = false;
  for (let i = 0; i < 20 * 8; i++) { p.pos.x += 2.1 * 0.05; M.noises = [noiseOf(p)]; tick(M, c, beh); if (c.state === 'walk') { c.state = 'idle'; c.path = null; } if (c.state !== 'idle') seen = true; }
  ok(!seen && M.hits.length === 0, 'silent player at 1.4 m is ignored (needs a real bump < 1.05 m)');
}
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', 0.6, 0.4, 0.02);                   // standing INSIDE it (bump)
  M.players.push(p);
  tick(M, c, beh);
  ok(M.hits.length === 1, 'bumping into it (< 1.05 m) is a hit even when silent');
}

// 2. walking player: heard at 6.6 m (0.3 x 22), not at 8; sprinting heard at 15
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', 8, 0, 0.3);
  M.players.push(p); M.noises = [noiseOf(p)];
  for (let i = 0; i < 40; i++) { tick(M, c, beh); }
  ok(c.state === 'idle' || c.state === 'walk', 'walking player at 8 m is out of earshot');
  p.pos.x = 5.5; M.noises = [noiseOf(p)];
  tick(M, c, beh);
  ok(c.state === 'alert', 'walking player at 5.5 m is heard: alert first (telegraph)');
  const t0 = c.t; let hunted = false;
  for (let i = 0; i < 60 && !hunted; i++) { M.noises = [noiseOf(p)]; tick(M, c, beh); if (c.state === 'hunt') hunted = true; }
  ok(hunted && c.t < 0.2 && M.game.time > LISTENER_CFG.alertT * 0.9, `alert lasts ~${LISTENER_CFG.alertT}s then hunt (${M.game.time.toFixed(2)}s)`);
  void t0;
}
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', 14, 0, 0.7);
  M.players.push(p);
  let dist0 = 0, hit = false, tHit = 0;
  for (let i = 0; i < 20 * 12; i++) { M.noises = [noiseOf(p)]; tick(M, c, beh); if (M.hits.length && !hit) { hit = true; tHit = M.game.time; } if (c.state === 'hunt' && !dist0) dist0 = c.travelled; }
  const hv = c.travelled / Math.max(1, M.game.time);
  ok(hit && tHit < 4, `sprinting player at 14 m is hunted down and hit (${tHit.toFixed(1)} s)`);
  ok(c.travelled > 10, 'it ran (>10 m travelled)');
  void dist0; void hv;
}

// 3. decoy: a quiet player 5 m away, a noisemaker 20 m the other way: it goes to the decoy, inspects, searches, forgets
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', 5, 0, 0.02);
  M.players.push(p);
  const decoy = { pos: { x: -20, y: 0, z: 0 }, loud: 2.4, owner: null };
  let phases = ['idle'], last = 'idle', inspectedDistance = Infinity;
  for (let i = 0; i < 20 * 40; i++) {
    M.noises = [noiseOf(p)];
    if (i < 20 * 9 && i % 25 === 0) M.noises.push({ ...decoy });    // a pulse every 1.25 s for 9 s (the Noisemaker)
    else if (i < 20 * 9) M.noises.push({ ...decoy });
    tick(M, c, beh);
    if (c.state === 'inspect') inspectedDistance = Math.min(inspectedDistance, flat(c.pos, decoy.pos));
    if (c.state !== last) { phases.push(c.state); last = c.state; }
  }
  ok(phases.join('>').startsWith('idle>alert>hunt>inspect>search>idle'), `decoy state chain: ${phases.join('>')}`);
  ok(M.hits.length === 0, 'the quiet player was never touched');
  ok(M.game.stealth.inspected === 1, 'onInspect fired once (decoy investigated)');
  // After forgetting the decoy it deliberately resumes random roaming. Its
  // unrelated position at 40 s cannot prove whether it reached the decoy.
  ok(inspectedDistance < 1.5, 'it physically reached the decoy before inspecting and forgetting it');
}

// 4. newer noise re-targets a running hunter
{
  const M = new FakeM(), c = mk(L, 0, 0);
  M.noises = [{ pos: { x: 30, y: 0, z: 0 }, loud: 2.0, owner: null }];
  for (let i = 0; i < 20; i++) tick(M, c, beh);
  ok(c.state === 'hunt' || c.state === 'alert', 'started hunting east');
  M.noises = [{ pos: { x: 0, y: 0, z: -30 }, loud: 2.4, owner: null }];
  for (let i = 0; i < 6; i++) tick(M, c, beh);
  ok(c.state === 'hunt' && c.dest.z < -20, 'a louder / newer noise re-targets it');
}

// 5. hit -> turns on the attacker; noisy player inside reach is attacked while a quiet one right behind it is not
{
  const M = new FakeM(), c = mk(L, 0, 0);
  const p = player('p1', 12, 0, 0.02);
  M.players.push(p);
  c.data.hitBy = 'p1'; c.data.hitAt = 0;
  tick(M, c, beh);
  ok(c.state === 'alert', 'hit by a player: it turns towards him');
}
{
  const M = new FakeM(), c = mk(L, 0, 0);
  c.state = 'hunt'; c.data.init = 1; c.data.last = { x: 0, z: 0 };
  const quiet = player('q', 1.3, 0, 0.02), loud = player('l', 0, 1.4, 0.4);
  M.players.push(quiet, loud);
  M.noises = [noiseOf(loud)];
  tick(M, c, beh);
  ok(M.hits.length === 1 && M.hits[0].to === 'l', 'the noisy player is the one it strikes');
}

// 6. crawler: same brain, ramping speed
{
  registerCreature('crawler_test', { name: 'C', walk: 2.8, run: 11, hp: 100, dmg: 40 });
  const def = CREATURES.crawler_test;
  const M = new FakeM(), c = mk(def, 0, 0);
  const cb = soundHunter(CRAWLER_CFG);
  M.noises = [{ pos: { x: 40, y: 0, z: 0 }, loud: 3.0, owner: null }];
  let v0 = 0, v1 = 0;
  const speedOver = async (n) => { const b = c.travelled; for (let i = 0; i < n; i++) tick(M, c, cb); return (c.travelled - b) / (n * 0.05); };
  for (let i = 0; i < 6; i++) tick(M, c, cb);          // alert (0.35 s) then hunt starts
  v0 = await speedOver(4);                              // just after it starts running
  await speedOver(20);
  v1 = await speedOver(6);                              // ~1.5 s later
  ok(v1 > v0 && v1 > 6, `crawler ramps up (${v0.toFixed(1)} -> ${v1.toFixed(1)} m/s)`);
}

console.log(`stealth listener: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
