// WAVE 1 / worldx checks for tools/harness/headless.mjs (script = body of an async function run in the page after boot).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5190 --script tools/harness/wave1_worldx.js > out.json
// Proves: landmarks + chests + harvestables are generated deterministically (built twice -> identical), opening a chest
// spawns tiered loot (request path incl. the crowbar soft-event), chopping a tree / mining a rock drops components, the
// parkour hops are physically doable with the real player controller, each new biome (lava / ice / jungle) loads without
// errors, lava kills, ice is slippery, and how many draw calls landmarks + chests cost. Returns JSON (+ shot: a 2x2 jpeg
// data URL, 3x2: tower exterior, chest on the tower top, parkour start, ruin, ice lake, jungle).
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const R = { errs };
const T = (n = 10) => kefal.tick(n, 1 / 30, false);
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
g.godMode = true;
const M = await import('/src/game/moons.js');
const { buildMoonOutdoor } = await import('/src/world/terrain.js');
const CH = await import('/src/game/chests.js');
const { RNG } = await import('/src/core/rng.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
R.sectionErrors = [];
const sec = async (name, fn) => { try { await fn(); } catch (e) { R.sectionErrors.push(name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); try { takeoff(); } catch { /* ignore */ } } };

const land = async (moonId) => {
  g.run.daysLeft = 3; g.run.moon = moonId; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 14; i++) { T(10); await wait(10); }
};
const takeoff = () => { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); T(5); };
const look = (from, to, pitch = 0) => {
  const fx = g.engine.fx; fx.hurt = 0; fx.flash = 0; fx.blind = 0; fx.shake = 0; fx.noise = 0;
  g.player.teleport(from);
  g.player.yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z)); g.player.pitch = pitch;
  T(3); kefal.tick(1, 1 / 30, true);
};
const shots = [];
const grab = () => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  c.getContext('2d').drawImage(kefal.engine.canvas, 0, 0, 640, 360);
  shots.push(c);
};
const calls = () => { kefal.tick(1, 1 / 30, true); return kefal.engine.sceneStats?.calls; };
const groundAt = (x, z) => g.world.terrain.heightAt(x, z);

// ---- 0. loot tables per chest tier (pure) ------------------------------------------------------------------------------------
await sec('loot', async () => {
  const rng = new RNG(1234), out = {};
  for (const tier of ['wood', 'iron', 'gold', 'void']) {
    const hist = {}; let n = 0;
    for (let i = 0; i < 300; i++) for (const e of CH.fallbackChestLoot(tier, rng)) { hist[e.tier] = (hist[e.tier] || 0) + 1; n++; }
    out[tier] = { itemsPerChest: +(n / 300).toFixed(2), tiers: hist };
  }
  R.lootTables = out;
});

// ---- 1. moons: landmarks / chests / harvestables / draw calls ------------------------------------------------------------------
R.moons = {};
const done = {};
for (const id of ['hamsi', 'palamut', 'levrek', 'orkinos']) await sec('moon ' + id, async () => {
  await land(id);
  const out = g.world.outdoor, lm = out.landmarks, moon = M.MOONS[id];
  const base = { pos: g.player.pos.clone() };
  g.player.teleport(V(0, 2, 12)); T(20);
  const withAll = calls();
  lm.mesh.visible = false;
  const chestVis = g.worldx.chests().length;
  for (const c of [...(g.world.outdoor.group.children)]) if (c.name?.startsWith('chest-')) c.visible = false;
  const without = calls();
  lm.mesh.visible = true;
  for (const c of [...(g.world.outdoor.group.children)]) if (c.name?.startsWith('chest-')) c.visible = true;
  const kinds = {}; for (const s of lm.sites) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const tiers = {}; for (const c of g.worldx.chests()) tiers[c.tier] = (tiers[c.tier] || 0) + 1;
  R.moons[id] = { scale: out.terrain.scale, landmarks: lm.sites.length, kinds, colliderBoxes: lm.boxes, chests: chestVis, chestTiers: tiers, trees: out.harvest.trees.length, rocks: out.harvest.rocks.length, drawCalls: withAll, drawCallsWithoutLandmarksAndChests: without, scrapSpots: lm.scrapSpots.length };
  void base; void moon;
  // screenshots (before anything is opened / chopped): tower exterior, chest on the tower top, parkour start, ruin
  const ts = !done.tower && lm.sites.find((q) => q.kind === 'tower');
  if (ts) {
    done.tower = true;
    const top = lm.chests.find((c) => c.landmark === ts.idx);
    const from = V(ts.x + Math.sin(ts.rot + 0.9) * 16, 0, ts.z + Math.cos(ts.rot + 0.9) * 16); from.y = groundAt(from.x, from.z);
    look(from, V(ts.x, (ts.y0 || 0) + 7, ts.z), 0.4); grab();
    if (top) {
      const f = V(Math.sin(top.yaw), 0, Math.cos(top.yaw));
      look(V(top.x + f.x * 2.8, top.y + 0.05, top.z + f.z * 2.8), V(top.x, top.y + 0.4, top.z), -0.18); grab();
      R.towerTop = { moon: id, tier: top.tier, y: +top.y.toFixed(1), groundY: +groundAt(ts.x, ts.z).toFixed(1), flights: ts.flights, style: ts.style };
    }
  }
  // parkour: every hop with the real player controller (aiming at the middle of the next platform, speed 4..8.2 m/s)
  if (!done.parkour && lm.parkour.length) {
    done.parkour = true;
    const route = lm.parkour[0], P = route.plats, fails = [], hops = [];
    { const a = P[0], b = P[1], d = V(b.x - a.x, 0, b.z - a.z).normalize(), from = V(a.x - d.x * 7, 0, a.z - d.z * 7); from.y = groundAt(from.x, from.z); look(from, V(a.x + d.x * 8, a.top + 3.5, a.z + d.z * 8), 0.25); grab(); }
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const D = L - (a.sz / 2 - 0.3), tAir = (6.2 + Math.sqrt(6.2 * 6.2 - 2 * 19.6 * b.dh)) / 19.6;
      const need = D / tAir, speed = Math.min(8.2, Math.max(4.0, need));
      g.player.teleport(V(a.x + ux * (a.sz / 2 - 0.3), a.top + 0.05, a.z + uz * (a.sz / 2 - 0.3))); g.player.hp = 100; T(3);
      g.player.vel.set(ux * speed, 6.2, uz * speed); g.player.grounded = false;
      let landed = false;
      for (let k = 0; k < 110; k++) { if (!g.player.grounded || k < 4) { g.player.vel.x = ux * speed; g.player.vel.z = uz * speed; } kefal.tick(1, 1 / 60, false); if (g.player.grounded && k > 4) { landed = true; break; } }
      const pp = g.player.pos, c = Math.cos(b.yaw), sn = Math.sin(b.yaw), wx = pp.x - b.x, wz = pp.z - b.z;
      const lx = wx * c - wz * sn, lz = wx * sn + wz * c;
      const ok = landed && Math.abs(lx) <= b.sx / 2 + 0.34 && Math.abs(lz) <= b.sz / 2 + 0.34 && Math.abs(pp.y - b.top) < 0.4;
      hops.push({ i: i + 1, type: b.type, gap: +b.gap.toFixed(2), dh: +b.dh.toFixed(2), hard: !!b.hard, needSpeed: +need.toFixed(2), ok });
      if (!ok) fails.push({ i: i + 1, gap: +b.gap.toFixed(2), dh: +b.dh.toFixed(2), hard: !!b.hard, needSpeed: +need.toFixed(2), landed, lx: +lx.toFixed(2), lz: +lz.toFixed(2), y: +(pp.y - b.top).toFixed(2) });
    }
    R.parkour = { moon: id, platforms: P.length, goalTop: +P[P.length - 1].top.toFixed(1), hopsOk: hops.filter((h) => h.ok).length, hopsTotal: hops.length, hardHops: hops.filter((h) => h.hard).length, maxNeedSpeed: Math.max(...hops.map((h) => h.needSpeed)), fails };
  }
  const rs = !done.ruin && lm.sites.find((q) => q.kind === 'ruin');
  if (rs) {
    done.ruin = true;
    const from = V(rs.x + Math.sin(rs.rot + 2.2) * 19, 0, rs.z + Math.cos(rs.rot + 2.2) * 19); from.y = groundAt(from.x, from.z);
    look(from, V(rs.x, (rs.y0 || 0) + 4, rs.z), 0.22); grab();
    R.ruin = { moon: id, floors: rs.floors };
  }
  if (id === 'hamsi') {
    // determinism: build the very same outdoor twice more and compare everything the peers must agree on
    const seed = g.run.seed;
    const sig = (o) => JSON.stringify({ s: o.landmarks.sites, c: o.landmarks.chests, sp: o.landmarks.scrapSpots, t: o.harvest.trees.map((t) => [t.id, +t.x.toFixed(2), +t.z.toFixed(2)]), r: o.harvest.rocks.length });
    const a = buildMoonOutdoor(seed, M.MOONS[id], { physics: g.physics, lightPool: g.lights });
    const b = buildMoonOutdoor(seed, M.MOONS[id], { physics: g.physics, lightPool: g.lights });
    R.deterministic = sig(a) === sig(b) && sig(a) === sig(out);
    R.signatureBytes = sig(a).length;
    a.dispose(g.physics); b.dispose(g.physics);
    // ---- chest opening: unlocked path, locked path (denied without a tool, ok via the crowbar soft-event) ---------------------
    const list = g.worldx.chests();
    const near = (c) => { g.player.teleport(V(c.x + 1.6, c.y + 0.1, c.z)); g.player.yaw = Math.PI / 2; T(4); };
    const itemsNear = (c, r = 4) => [...g.items.all()].filter((it) => it.obj && Math.hypot(it.obj.position.x - c.x, it.obj.position.z - c.z) < r && Math.abs(it.obj.position.y - c.y) < 6);
    const wood = list.find((c) => c.tier === 'wood'), locked = list.find((c) => c.tier !== 'wood');
    const rep = {};
    if (wood) {
      const b0 = itemsNear(wood).length; near(wood);
      g.worldx.openChest(wood.id); T(25);
      const it = itemsNear(wood);
      rep.wood = { id: wood.id, opened: g.worldx.chest(wood.id).opened, spawned: it.length - b0, types: it.map((i) => i.type) };
    }
    if (locked) {
      const b0 = itemsNear(locked).length; near(locked);
      g.net.request('wxOpen', { id: locked.id, s: g.world.seed });   // no key / lockpick / weapon -> must be refused
      T(5);
      rep.lockedRefused = !g.worldx.chest(locked.id).opened;
      g.mods.emit('tfg:pry', { pos: [locked.x, locked.y, locked.z] }); T(25);
      const it = itemsNear(locked);
      rep.locked = { id: locked.id, tier: locked.tier, openedByPry: g.worldx.chest(locked.id).opened, spawned: it.length - b0, types: it.map((i) => i.type) };
    }
    R.chestOpen = rep;
    // ---- harvesting -------------------------------------------------------------------------------------------------------------
    const H = g.worldx.harvest, rep2 = {};
    for (const kind of ['tree', 'rock']) {
      const n = H.nearest(V(0, 0, 0), kind);
      if (!n) { rep2[kind] = 'none on this map'; continue; }
      g.player.teleport(V(n.x + 2.2, n.y + 0.2, n.z)); T(4);
      const before = [...g.items.all()].filter((it) => it.type === (kind === 'tree' ? 'comp_wood' : 'comp_scrapmetal')).length;
      const i0 = H.info(n.id);
      H.hostHit(n.id, 20, g.selfId); T(3);
      const i1 = H.info(n.id);
      H.hostHit(n.id, 999, g.selfId); T(90);
      const i2 = H.info(n.id);
      const after = [...g.items.all()].filter((it) => it.type === (kind === 'tree' ? 'comp_wood' : 'comp_scrapmetal')).length;
      rep2[kind] = { id: n.id, hpStart: Math.round(i0.hp), hpAfterHit: Math.round(i1.hp), fallen: i2.fallen, dropped: after - before };
    }
    R.harvest = rep2;
  }
  takeoff();
});

// ---- 4. new biomes ---------------------------------------------------------------------------------------------------------------------
M.registerMoon({ id: 'wxlava', name: 'WX Lava Basin', short: 'WXL', biome: 'lava', interior: 'factory', size: 1.3, tier: 3, mapScale: 1.2, lavaMul: 1.3, sector: 3, ponds: 0 });
M.registerMoon({ id: 'wxice', name: 'WX Cold Storage', short: 'WXI', biome: 'ice', interior: 'factory', size: 1.3, tier: 3, mapScale: 1.2, blizzard: true, sector: 3, ponds: 0 });
M.registerMoon({ id: 'wxjungle', name: 'WX Link Rot', short: 'WXJ', biome: 'jungle', interior: 'factory', size: 1.3, tier: 3, mapScale: 1.2, sector: 3 });
R.biomes = {};
for (const id of ['wxlava', 'wxice', 'wxjungle']) await sec('biome ' + id, async () => {
  const e0 = errs.length;
  await land(id);
  const out = g.world.outdoor, terr = out.terrain, lm = out.landmarks;
  g.player.teleport(V(0, 2, 12)); T(20);
  const info = { scale: terr.scale, landmarks: lm.sites.map((s) => s.kind), chests: g.worldx.chests().length, trees: out.harvest.trees.length, drawCalls: calls(), fog: +g.engine.scene.fog.density.toFixed(4) };
  if (id === 'wxlava') {
    let cells = 0, pts = [];
    for (let z = -110; z <= 110; z += 6) for (let x = -110; x <= 110; x += 6) if (terr.lavaDepthAt(x, z) > 0.8) { cells++; pts.push({ x, z, d: Math.hypot(x, z) }); }
    pts.sort((a, b) => a.d - b.d);
    info.lavaCells = cells;
    info.blockedTests = { ship: terr.blocked(0, 0), landmarksOnLava: lm.sites.filter((s) => terr.lavaDepthAt(s.x, s.z) > -0.5).length };
    if (pts.length) {
      const P = pts[Math.min(3, pts.length - 1)];
      // screenshot 3: at the bank, looking over the river
      const dir = V(P.x, 0, P.z).normalize();
      // lava kills
      g.godMode = false; g.player.hp = 100; g.player.dead = false;
      g.player.teleport(V(P.x, groundAt(P.x, P.z) + 0.05, P.z)); T(3);
      for (let k = 0; k < 90 && !g.player.dead; k++) kefal.tick(1, 1 / 30, false);
      info.lava = { diedInLava: g.player.dead, hp: Math.round(g.player.hp), lavaT: +g.worldx.hazards.lavaT.toFixed(2) };
      g.godMode = true; if (g.player.dead) { g.respawn(); }
    }
  }
  if (id === 'wxice') {
    const l = out.plan.lakes[0];
    info.lakes = out.plan.lakes.length;
    if (l) {
      // slide test: same launch speed on the ice and on dry ground, no input: distance covered in 0.6 s
      const slide = (x, z) => {
        g.player.teleport(V(x, groundAt(x, z) + 0.05, z)); T(6);
        g.player.vel.set(5, 0, 0); const x0 = g.player.pos.x;
        for (let k = 0; k < 36; k++) kefal.tick(1, 1 / 60, false);
        return +(g.player.pos.x - x0).toFixed(2);
      };
      const iceD = slide(l.x - 4, l.z), onIce = terr.onIce(l.x, l.z);
      const dryD = slide(-30, 30);
      info.ice = { onIce, slideOnIce: iceD, slideOnGround: dryD };
      const from = V(l.x + (l.r + 8) * (0.6), 0, l.z + (l.r + 8) * 0.8); from.y = groundAt(from.x, from.z) + 0.1;
      look(from, V(l.x, l.y + 1, l.z), -0.05);
      grab();
    }
  }
  const cnt = { meshes: 0, instanced: 0, points: 0, sprites: 0 };
  out.group.traverse((o) => { if (o.isInstancedMesh) cnt.instanced++; else if (o.isMesh) cnt.meshes++; else if (o.isPoints) cnt.points++; else if (o.isSprite) cnt.sprites++; });
  info.objectsInOutdoorGroup = cnt;
  if (id === 'wxjungle') look(V(6, groundAt(6, 22) + 0.1, 22), V(0, 5, 50), 0.18), grab();
  info.errsBefore = e0; info.errsAfter = errs.length;
  R.biomes[id] = info;
  takeoff();
});

// ---- 5. sectors: new planets show up deeper (moongen) --------------------------------------------------------------------------------------
await sec('sectors', async () => {
  const MG = await import('/src/game/moongen.js');
  const seen = {}, det = [];
  for (let idx = 0; idx < 12; idx++) {
    const a = MG.generateSector('worldx-check', idx), b = MG.generateSector('worldx-check', idx);
    det.push(JSON.stringify(a.moons) === JSON.stringify(b.moons));
    for (const m of a.moons) { const k = idx < 2 ? 'early' : 'deep'; seen[m.biome] = seen[m.biome] || { early: 0, deep: 0 }; seen[m.biome][k]++; }
  }
  const sc = []; for (const i of [0, 4, 9]) sc.push({ sector: i, mapScales: MG.generateSector('worldx-check', i).moons.map((m) => m.mapScale) });
  R.sectors = { deterministic: det.every(Boolean), biomeCounts: seen, mapScaleGrowth: sc };
});

// ---- composite screenshot -----------------------------------------------------------------------------------------------------------------------
{
  const big = document.createElement('canvas'); big.width = 1920; big.height = 720;
  const ctx = big.getContext('2d');
  shots.forEach((c, i) => ctx.drawImage(c, (i % 3) * 640, ((i / 3) | 0) * 360));
  R.shotCount = shots.length;
  R.shot = big.toDataURL('image/jpeg', 0.82);
}
R.errsTotal = errs.length;
return R;
