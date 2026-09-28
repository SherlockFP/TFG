// Wave-2 SKELETONS proof (body of an async function, run by tools/harness/headless.mjs after boot). ONE run + ONE screenshot:
//   npx vite --host 127.0.0.1 --port 5262 --strictPort &
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5262 --script tools/harness/wave2_skeletons.js --shot /tmp/skeletons.png
// Host-path checks (no rendering needed): Walker collapse -> rebuild once / smash, Knight shield front vs flank vs heavy, Archer wind-up + projectile
// + hit, Swarm group spawn, night outdoor director. Then a LINEUP of every skeleton type at all six tiers plus generic creatures at higher tiers
// (proof of the generic tier look layer), posed with a fixed camera for the screenshot.
const g = kefal.game, M = g.creatures, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sim = async (sec, dt = 1 / 30) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i += 10) { kefal.tick(Math.min(10, n - i), dt, false); await wait(4); } };
const R = { installed: !!g.skeletons, errs };
if (!g.skeletons) return R;
const clearAll = () => { for (const id of [...M.host.keys()]) M.hostRemove(id); };

// ---- land on a moon, daylight, invulnerable player standing outside
g.run.daysLeft = 3; g.run.moon = 'palamut'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await wait(10); }
g.run.time = 780; g.run.weather = 'clear'; g.godMode = true;
const terr = g.world.terrain;
R.moon = { id: g.run.moon, phase: g.run.phase, hasTerrain: !!terr, theme: g.world.facility?.layout?.theme };
const H = (x, z) => terr.heightAt(x, z);
const at = (x, z, dy = 0) => new THREE.Vector3(x, H(x, z) + dy, z);
clearAll();
const hurts = [];
const origHurt = g.hostHurtPlayer;
g.hostHurtPlayer = function (id, dmg, cause, from) { hurts.push({ dmg, cause, from }); };   // count instead of hurting

// ---- flat test arena
const A = at(40, 40);
const P = (dx, dz) => at(A.x + dx, A.z + dz);
const stand = async (pos, yaw = 0) => { g.player.teleport(new THREE.Vector3(pos.x, pos.y + 0.1, pos.z)); g.player.inShip = false; g.player.yaw = yaw; await sim(0.2); };
const spawn = (type, pos, o = {}) => { const c = g.skeletons.spawn(type, pos, { zone: 'out', tier: 'common', ...o }); if (c) c.age = 5; return c; };
const hit = (c, dmg, opts = {}) => M.damage(c.id, dmg, g.selfId, opts);

// ---- 1. Bone Walker: collapse -> rebuild (once), smash
await stand(P(0, -6), 0);
let w = spawn('skel_walker', P(0, 0)); w.stunT = 0; w.cooldown = 99; w.data.think = 99;
const hp0 = w.hp;
hit(w, 9999);
R.walker = { hp0, afterLethal: { state: w.state, hp: w.hp, dead: w.dead } };
await sim(1.0);
R.walker.lyingAt1s = { state: w.state, dead: w.dead };
await sim(3.4);
R.walker.at4_4s = { state: w.state, hp: w.hp, rebuilt: !!w.data.rebuilt };
await sim(1.6);
R.walker.afterRise = { state: w.state, hp: w.hp, maxHp: w.maxHp, rebuilt: !!w.data.rebuilt, dead: w.dead };
hit(w, 9999);
R.walker.secondLethal = { dead: w.dead };
const w2 = spawn('skel_walker', P(3, 0)); w2.cooldown = 99;
hit(w2, 9999); await sim(1.5); const lying = w2.state; hit(w2, 1);
R.walkerSmash = { lyingBefore: lying, deadAfterSecondHit: w2.dead };

// ---- 2. Bone Knight: shield front / flank / heavy
const kn = spawn('skel_knight', P(-6, 0)); kn.data.think = 1e9;
const resetKn = () => { kn.yaw = 0; kn.target = null; kn.stunT = 0; kn.setState('idle'); kn.t = -1e6; kn.pos.copy(P(-6, 0)); };   // faces +z, stands still
const kHp = kn.hp;
await stand(P(-6, 4), Math.PI);                                           // player in FRONT (z+)
resetKn(); hit(kn, 20); const front = kHp - kn.hp;
await stand(P(-6, -4), 0);                                                // player BEHIND (z-)
resetKn(); const b1 = kn.hp; hit(kn, 20); const back = b1 - kn.hp;
await stand(P(-6, 4), Math.PI);
resetKn(); const b2 = kn.hp; hit(kn, 20, { crit: true }); const heavy = b2 - kn.hp;
const staggered = kn.state === 'stunned', stunT = kn.stunT;
const b3 = kn.hp; hit(kn, 20); const whileStaggered = b3 - kn.hp;
R.knight = { maxHp: kn.maxHp, frontDamageFor20: +front.toFixed(2), backDamageFor20: +back.toFixed(2), heavyCritFrontFor20: +heavy.toFixed(2), staggered, stunT: +stunT.toFixed(2), frontWhileStaggered: +whileStaggered.toFixed(2) };

// ---- 3. Bone Archer: wind-up telegraph, projectile, hit
clearAll(); hurts.length = 0;
await stand(P(0, -6), 0);
const ar = spawn('skel_archer', P(0, 6)); ar.cooldown = 0; ar.yaw = Math.PI;   // faces the player
const seen = { draw: 0, throw: 0 }, t0 = g.time;
let firstDraw = null, shots = 0;
for (let i = 0; i < 200 && shots === 0; i++) {
  kefal.tick(1, 1 / 30, false); await wait(2);
  if (ar.state === 'draw') { seen.draw++; if (firstDraw === null) firstDraw = g.time; }
  if (ar.state === 'throw') seen.throw++;
  shots = g.skeletons.stats().shots + hurts.filter((h) => h.cause === 'skel_archer').length;
}
R.archer = { drawFrames: seen.draw, windupSeconds: firstDraw === null ? null : +(g.time - firstDraw).toFixed(2), throwFrames: seen.throw, clientShots: g.skeletons.stats().shots, hostProj: g.skeletons.stats().proj };
await sim(2.5);
R.archer.hits = hurts.filter((h) => h.cause === 'skel_archer').length; R.archer.state = ar.state; R.archer.distToPlayer = +ar.pos.distanceTo(g.player.pos).toFixed(1);

// ---- 4. Bone Swarm: one spawn calls its group
clearAll();
await stand(P(0, -20), 0);
spawn('skel_swarm', P(0, 10));
await sim(0.6);
R.swarm = { alive: [...M.host.values()].filter((c) => c.type === 'skel_swarm' && !c.dead).length };

// ---- 5. night outdoors (18:30+): the director spawns skeletons around a player who is outside
clearAll();
await stand(P(0, 0), 0);
g.run.time = 1150; g.run.phase = 'moon';
await sim(80, 0.1);
R.night = { outdoorSkeletons: [...M.host.values()].filter((c) => c.zone === 'out' && c.type.startsWith('skel_')).map((c) => c.type), stats: g.skeletons.stats() };
g.hostHurtPlayer = origHurt;
g.run.time = 780;

// ---- 6. lineup for the screenshot: every skeleton at all tiers + generic creatures at higher tiers
clearAll();
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
let best = null;
for (let a = 0; a < 8; a++) for (const r of [30, 40, 50]) {
  const cx = Math.cos(a * Math.PI / 4) * r, cz = Math.sin(a * Math.PI / 4) * r;
  let lo = 1e9, hi = -1e9;
  for (let i = -3; i <= 3; i++) for (let j = -1; j <= 6; j++) { const h = H(cx + i * 2.4, cz + j * 2.4); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  if (!best || hi - lo < best.v) best = { v: hi - lo, cx, cz };
}
const L0 = new THREE.Vector3(best.cx, H(best.cx, best.cz), best.cz);
const col = (i) => (i - 2.5) * 2.4, row = (j) => j * 2.5;
const made = [];
const put = (type, i, j, tier, state) => {
  const c = g.skeletons.spawn(type, at(L0.x + col(i), L0.z + row(j)), { zone: 'out', tier });
  if (!c) return;
  c.stunT = 1e6; c.yaw = Math.PI - 0.75; c.age = 5;   // faces the camera, turned a little so capes show
  if (state) c.setState(state);
  made.push(c);
};
TIERS.forEach((t, i) => put('skel_swarm', i, 0, t));
TIERS.forEach((t, i) => put('skel_walker', i, 1, t));
TIERS.forEach((t, i) => put('skel_archer', i, 2, t, 'draw'));
TIERS.forEach((t, i) => put('skel_knight', i, 3, t));
[['skel_walker', 'uncommon', 'collapsed'], ['scuttler', 'uncommon'], ['crawler', 'rare'], ['moderator', 'epic'], ['support', 'legendary'], ['hound', 'mythic']].forEach(([ty, t, st], i) => put(ty, i, 4, t, st));
await sim(1.2);
const looks = [...M.views.values()].filter((v) => v.tier && v.tier !== 'common');
R.lineup = { created: made.length, views: M.views.size, tiered: looks.length, withGear: looks.filter((v) => v.tierLook?.objs?.length).length, byType: {} };
for (const v of looks) { const k = v.type; (R.lineup.byType[k] ||= { n: 0, gear: 0 }); R.lineup.byType[k].n++; if (v.tierLook?.objs?.length) R.lineup.byType[k].gear++; }
let tris = 0, calls = 0; g.scene.traverse((o) => { if (o.isMesh && o.visible) { calls++; const gm = o.geometry; tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3; } });
R.lineup.scene = { meshes: calls, triangles: Math.round(tris) };

// camera: fixed, looking over the lineup (re-applied after every game update so the screenshot keeps it)
const camPos = new THREE.Vector3(L0.x, L0.y + 4.6, L0.z - 8.5), look = new THREE.Vector3(L0.x, L0.y + 0.9, L0.z + 4.5);
const upd = g.update.bind(g);
g.update = function (dt) { upd(dt); g.camera.position.copy(camPos); g.camera.lookAt(look); if (g.camera.fov !== 42) { g.camera.fov = 42; g.camera.updateProjectionMatrix(); } };
try { for (const el of document.querySelectorAll('.hud, #hud, .crosshair, #crosshair')) el.style.display = 'none'; kefal.ui.hud?.el && (kefal.ui.hud.el.style.display = 'none'); } catch { /* cosmetic */ }
g.viewModel?.root && (g.viewModel.root.visible = false);
try { kefal.ui.clickHint.style.display = 'none'; } catch { /* cosmetic */ }
const t1 = performance.now();
for (let i = 0; i < 12; i++) { kefal.tick(5, 1 / 30, true); await wait(30); }
R.lineup.renderMsPerFrame = +((performance.now() - t1) / 12).toFixed(0);
R.errs = errs;
return R;
