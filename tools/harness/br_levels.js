// Headless feature test for the Backrooms levels (wave-1 module 'brlevels'). Body for tools/harness/headless.mjs:
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5201 --script tools/harness/br_levels.js --shot /tmp/br.png
// Forces the backrooms interior (+ the rare levels) on the first moon, lands, walks the local player into every level
// and returns concrete numbers: level cell counts, levelAt() agreement, 'tfg:brlevel' events, captions, bake stats,
// fog per level, draw calls per view. Set window.__brShots = true before running to also get JPEG data URLs.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const { MOONS } = await import('/src/game/moons.js');
const seed = window.__brSeed || 1337;   // this seed's layout has every level (Level 2 tunnels included) at size 1.2
MOONS.hamsi.interior = 'backrooms';
MOONS.hamsi.size = window.__brSize || 1.2;
window.__brForce = window.__brNoForce ? null : { fun: true, run: true, manila: true };
const events = [], played = [];
g.mods.on('tfg:brlevel', (d) => events.push(d.id + (d.first ? '*' : '')));
{ const orig = g.audio.play.bind(g.audio); g.audio.play = (name, o) => { if (/brl_|lights_buzz|siren|alarm|jester|drip|pipe|steam|flicker|ambience/.test(name) && played.length < 80) played.push(name); return orig(name, o); }; }
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true;
{ const mr = Math.random; Math.random = () => (seed % 999983) / 999983; try { g.hostLever(g.selfId); } finally { Math.random = mr; } }   // hostLever rolls run.seed
g.hostFinishLanding();
for (let i = 0; i < 15; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
const fac = g.world.facility, L = fac.layout, plan = L.brPlan, W = L.w, C = L.cell;
const shots = [], views = [];
const snap = () => {
  if (!window.__brShots) return null;
  const src = kefal.engine.renderer.domElement, c = document.createElement('canvas'); c.width = 640; c.height = 360;
  c.getContext('2d').drawImage(src, 0, 0, 640, 360);
  return c.toDataURL('image/jpeg', 0.85);
};
const IDX = Object.fromEntries(g.brlevels.LEVELS.map((l) => [l.id, l.index]));
const cellsOf = (id) => { const out = []; for (let i = 0; i < W * L.h; i++) if (plan.cellLevel[i] === IDX[id]) out.push(i); return out; };
const center = (i) => ({ x: L.ox + ((i % W) + 0.5) * C, z: L.oz + (Math.floor(i / W) + 0.5) * C });
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1], YAW = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];
const reach = (i, d) => { let x = i % W, z = Math.floor(i / W), n = 0; while (n < 12 && L.open.has(L.edgeKey(x, z, d))) { x += DX[d]; z += DZ[d]; n++; } return n; };
const bestDir = (i) => { let b = 0, bd = 0; for (let d = 0; d < 4; d++) { const n = reach(i, d); if (n > b) { b = n; bd = d; } } return { d: bd, n: b }; };
const view = async (name, pos, yaw, pitch = 0) => {
  g.player.teleport(new THREE.Vector3(pos.x, L.y + 0.1, pos.z), yaw);
  g.player.pitch = pitch;
  kefal.tick(40, 1 / 30, true);
  const lvl = g.brlevels.levelAt(g.player.pos);
  const amb = [...(g.audio.ambience || new Map()).entries()].filter(([k]) => k.startsWith('brl')).map(([k, h]) => k + ':' + h.name);
  views.push({ name, lvl, cur: g.brlevels.current, calls: kefal.engine.sceneStats?.calls, amb, audio: g.audio.ctx?.state || 'none', fog: g.env.interiorFog ? [g.env.interiorFog.fog.toString(16), +g.env.interiorFog.density.toFixed(3)] : null, light: +g.lights.ambient.intensity.toFixed(3) });
  shots.push(snap());
};
// Level 0: the open zone cell with the longest view, then a corridor
{
  let best = null;
  for (const i of cellsOf('l0')) { if (!L.zoneMask[i] || L.distOf[i] < 4 || plan.cellLight[i] < 0.5) continue; const b = bestDir(i); if (!best || b.n > best.n) best = { i, ...b }; }
  if (best) await view('l0_zone', center(best.i), YAW[best.d], 0.05);
  const cor = cellsOf('l0').filter((i) => L.cells[i] === 2 && !L.zoneMask[i] && L.distOf[i] > 5).map((i) => ({ i, ...bestDir(i) })).sort((a, b) => b.n - a.n)[0];
  if (cor) await view('l0_corridor', center(cor.i), YAW[cor.d]);
}
for (const id of ['l1', 'l2', 'pool', 'fun']) {
  const cells = cellsOf(id);
  if (!cells.length) { views.push({ name: id, missing: true }); continue; }
  const r = L.rooms[L.roomOf[cells[0]]];
  if (id === 'l2') {   // stand at the start of the first tunnel lane, look down it
    const alongX = r.w >= r.h, c = center(L.idx(r.x, r.z));
    await view(id, { x: c.x - (alongX ? 1.4 : 0), z: c.z - (alongX ? 0 : 1.4) }, alongX ? -Math.PI / 2 : Math.PI);
    continue;
  }
  // stand in a corner cell of the room, look at the far corner
  const i = L.idx(r.x, r.z + r.h - 1), c = center(i);
  const far = { x: L.ox + (r.x + r.w - 0.5) * C, z: L.oz + (r.z + 0.5) * C };
  const yaw = Math.atan2(-(far.x - c.x), -(far.z - c.z));
  await view(id, { x: c.x - (id === 'pool' ? 1.2 : 0.8), z: c.z + (id === 'pool' ? 1.2 : 0.8) }, yaw, id === 'pool' ? 0.12 : 0);
}
if (plan.run) {
  const c0 = center(plan.run.cells[0]), c1 = center(plan.run.cells[plan.run.cells.length - 1]);
  await view('run', c0, Math.atan2(-(c1.x - c0.x), -(c1.z - c0.z)));
} else views.push({ name: 'run', missing: true });
if (plan.manila) {
  const m = plan.manila, r = m.room, s = m.slot;
  const out = { x: L.ox + (s.x + DX[s.d] + 0.5) * C, z: L.oz + (s.z + DZ[s.d] + 0.5) * C };
  const inn = center(L.idx(s.x, s.z));
  await view('manila_outside', { x: out.x + DX[s.d] * 1.2, z: out.z + DZ[s.d] * 1.2 }, Math.atan2(-(inn.x - out.x), -(inn.z - out.z)));
  const rc = { x: L.ox + (r.x + r.w / 2) * C, z: L.oz + (r.z + r.h / 2) * C };
  await view('manila', { x: rc.x + (r.w > 1 ? C * 0.3 : 0), z: rc.z + (r.h > 1 ? C * 0.3 : 0) }, Math.atan2(-(rc.x - (rc.x + C * 0.3)), -(rc.z - (rc.z + C * 0.3))), -0.1);
} else views.push({ name: 'manila', missing: true });
// levelAt() agrees with the plan everywhere (sampled)
let agree = 0, total = 0;
for (let i = 0; i < W * L.h; i += 7) { if (!L.cells[i]) continue; total++; const c = center(i); if (g.brlevels.levelAt(new THREE.Vector3(c.x, L.y + 1, c.z)) === g.brlevels.LEVELS[plan.cellLevel[i] - 1].id) agree++; }
const lv = fac.group.getObjectByName('backrooms_levels');
// breaker rooms (hazards.js) start unpowered = baked dark; resetting one re-bakes the facility
const brk = fac.hazards?.breakers || fac.setPieces?.hazards?.breakers || [];
const breaker = { count: brk.length, darkBefore: g.brlevels.stats.bake?.dark ?? null };
if (brk.length) { brk[0].on = true; kefal.tick(12, 1 / 30, false); breaker.darkAfter = g.brlevels.stats.bake?.dark; breaker.rebakeMs = g.brlevels.stats.bake?.ms; breaker.runs = g.brlevels.stats.bake?.runs; }
const meshes = lv ? lv.children.map((m) => `${m.userData.brKey}:${m.geometry.attributes.position.count}`) : [];
const bakeStats = g.brlevels.stats.bake;
// leave: take off and land on a non-backrooms moon - the look must not leak (ambient colour, fog, bake uniform)
g.spawnInShip(); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
const { BAKE } = await import('/src/world/interiors/backrooms_tex.js');
const after = {};
g.run.daysLeft = 3; g.run.moon = 'levrek'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 10; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
{ const s2 = g.world.facility.scrapSpots[1]; g.player.teleport(new THREE.Vector3(s2.x, s2.y + 0.2, s2.z)); kefal.tick(20, 1 / 30, true); }
Object.assign(after, { theme: g.world.facility.layout.theme, level: g.brlevels.current, levelAt: g.brlevels.levelAt(g.player.pos), ambColor: g.lights.ambient.color.getHexString(), amb: +g.lights.ambient.intensity.toFixed(3), fogIsOurs: g.env.interiorFog === g.brlevels.stats.fog, bake: BAKE.value, brAmb: [...(g.audio.ambience || new Map()).keys()].filter((k) => k.startsWith('brl')) });
// back to the Backrooms for the final full-page screenshot: walking in shows the LEVEL 0 caption again (new day)
g.spawnInShip(); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true;
{ const mr = Math.random; Math.random = () => (seed % 999983) / 999983; try { g.hostLever(g.selfId); } finally { Math.random = mr; } }
g.hostFinishLanding();
for (let i = 0; i < 10; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
{
  const F = g.world.facility, L2 = F.layout, P2 = L2.brPlan, W2 = L2.w;
  let best = null;
  for (let i = 0; i < W2 * L2.h; i++) {
    if (P2.cellLevel[i] !== IDX.l0 || !L2.zoneMask[i] || L2.distOf[i] < 3 || P2.cellLight[i] < 0.5) continue;
    let bd = 0, bn = 0;
    for (let d = 0; d < 4; d++) { let x = i % W2, z = Math.floor(i / W2), n = 0; while (n < 12 && L2.open.has(L2.edgeKey(x, z, d))) { x += DX[d]; z += DZ[d]; n++; } if (n > bn) { bn = n; bd = d; } }
    if (!best || bn > best.n) best = { i, d: bd, n: bn };
  }
  if (best) { g.player.teleport(new THREE.Vector3(L2.ox + ((best.i % W2) + 0.5) * L2.cell, L2.y + 0.1, L2.oz + (Math.floor(best.i / W2) + 0.5) * L2.cell), YAW[best.d]); g.player.pitch = 0.04; }
  kefal.tick(75, 1 / 30, true);
}
return {
  seed, layoutSeed: L.seed, size: L.size, theme: L.theme, rooms: L.rooms.map((r) => r.type).join(','),
  counts: plan.counts, fun: !!plan.fun, run: plan.run?.cells.length || 0, manila: !!plan.manila, pillars: plan.pillars.length, stubs: plan.stubs.length,
  levelAt: `${agree}/${total}`, events, played: [...new Set(played)], captionEl: !!document.querySelector('.br-cap'),
  meshes, emitters: fac.emitters.length, bake: bakeStats, breaker, after,
  views, errs, shots: window.__brShots ? shots : undefined,
};
