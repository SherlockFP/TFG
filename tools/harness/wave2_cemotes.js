// Creature emotes feature check (body for tools/harness/headless.mjs --script):
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5263 --script tools/harness/wave2_cemotes.js
// Lands on a moon, spawns creatures next to the player and checks: idle emote, forced VICTORY emote (+ freeze, bubble, body transform, chat line),
// player dance -> a swarm creature dances along and is frozen (safe passage), player taunt -> a crawler is enraged and targets the taunter.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) await tick();
out.installed = !!g.cemotes; out.arch = { crawler: g.cemotes?.personality('crawler').arch, scuttler: g.cemotes?.personality('scuttler').arch, mimic: g.cemotes?.personality('mimic').arch };
const clear = async () => { for (const c of [...g.creatures.host.values()]) g.creatures.hostRemove(c.id); await tick(4); };
await clear();
const T = g.world.terrain, P = (x, z) => new THREE.Vector3(x, T.heightAt(x, z), z);
const me = P(30, 30); g.player.teleport(me.clone().add(new THREE.Vector3(0, 0.2, 0))); await tick(10);
const spawn = (type, dx, dz, state = 'idle') => { const c = g.creatures.hostSpawn(type, P(me.x + dx, me.z + dz), { zone: 'out', state, level: 1 }); c.age = 10; return c; };
const view = (c) => g.creatures.views.get(c.id);
const chatN = () => document.querySelectorAll('.chat-line').length;
const lastChat = () => [...document.querySelectorAll('.chat-line')].pop()?.textContent || '';

// ---- 1. idle emote (state idle, player within 40 m, timer due)
let c = spawn('crawler', 12, 0);
await tick(3);
g.cemotes.nextIdle.set(c.id, 0);
g.cemotes.book.m.clear();
await tick(45);                                   // > 1 s: the idle scan runs once per second
out.idle = { bodies: g.cemotes.stats().bodies, bubbles: g.cemotes.stats().bubbles, nextIdleSet: g.cemotes.nextIdle.get(c.id) > g.time };

// ---- 2. victory through the REAL path: the creature hurts you, you die, the host wraps hostOnPlayerDied -> freeze + body + bubble + chat + camera
await clear(); g.godMode = true;
c = spawn('lurker', 4, 0); await tick(3);
const n0 = chatN();
g.hostHurtPlayer(g.selfId, 1, 'lurker', c.id, c.pos);   // records the killer (godMode ignores the hit itself)
g.die('lurker');
await wait(600);                                  // the emote starts 350 ms (real time) after the death
let maxDy = 0, sawOrder = false, camD = null;
for (let i = 0; i < 40; i++) {
  await tick(1);
  const v = view(c);
  if (v) { maxDy = Math.max(maxDy, v.root.position.y - v.pos.y); if (v.root.rotation.order === 'YXZ') sawOrder = true; }
  if (i === 25 && v) camD = +g.camera.position.distanceTo(new THREE.Vector3(v.pos.x, v.pos.y + v.height * 0.6, v.pos.z)).toFixed(2);
}
out.victory = { frozen: c.stunT > 0 || c.state === 'idle', stunT: +c.stunT.toFixed(2), maxDy: +maxDy.toFixed(3), bodyLayer: sawOrder, chat: chatN() > n0, line: lastChat().slice(0, 120), camDist: camD, focus: g.cemotes.stats().focus, stats: g.cemotes.stats() };
await tick(120);                                  // let it finish: the transform must be restored, the camera released
const v = view(c);
out.victoryEnd = { bodies: g.cemotes.stats().bodies, focus: g.cemotes.stats().focus, order: v?.root.rotation.order, rx: +(v?.root.rotation.x || 0).toFixed(3), sy: +(v?.root.scale.y || 0).toFixed(3) };
g.respawn(); g.player.teleport(me.clone().add(new THREE.Vector3(0, 0.2, 0))); await tick(10);

// ---- 3. player dances next to a Spam Bot (swarm): it dances along and is not hostile
await clear();
c = spawn('scuttler', 5, 0, 'run'); c.target = g.selfId; await tick(3);
g.cemotes.book.m.clear(); g.cemotes.book.hist.clear();
g.emote = 'dance'; g.emoteT = g.time + 8;
await tick(20); await wait(1400); await tick(15);
out.danceAlong = { stunT: +c.stunT.toFixed(2), state: c.state, target: c.target, body: g.cemotes.stats().bodies > 0, bubbles: g.cemotes.stats().bubbles };
g.emote = null; await tick(30);

// ---- 4. player taunts a Web Crawler: it is enraged and goes for the taunter
await clear();
c = spawn('crawler', 6, 0, 'idle'); await tick(3);
g.cemotes.book.m.clear(); g.cemotes.book.hist.clear();
g.emote = 'x:rage'; g.emoteT = g.time + 3;
await tick(20); await wait(1400); await tick(10);
out.taunt = { state: c.state, target: c.target === g.selfId, noises: g.creatures.noises.length };
g.emote = null;

// ---- 5. a mimic copies the emote (no freeze)
await clear();
c = spawn('mimic', 5, 0, 'idle'); await tick(3);
g.cemotes.book.m.clear(); g.cemotes.book.hist.clear();
g.emote = 'x:flex'; g.emoteT = g.time + 3;
await tick(20); await wait(1400); await tick(10);
out.mimicCopy = { bodies: g.cemotes.stats().bodies, stunT: c.stunT };
g.emote = null;
await clear();
return { out, errs };
