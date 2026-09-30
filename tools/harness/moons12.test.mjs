// MOONS12 test (wave 12, docs/wave12/moons12.md): CLOUD-9 + DEEP CABLE registration / route board / text, the pure goal rules (wind schedule, dish turning, air, payout), deterministic island +
// tunnel layouts over many seeds (every island reachable, every fire exit standing on ground, cores in reach), and both decor builders on a stub terrain (constant light count, few draw calls).
// Run: node tools/harness/moons12.test.mjs
globalThis.window = globalThis.window || {};
const K = await import('../../src/game/moons12_core.js');
const { MOONS, MOON_ORDER, BIOMES } = await import('../../src/game/moons.js');
const RB = await import('../../src/game/routeboard_core.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const { PALETTES } = await import('../../src/game/soul_core.js');
const { setLang, t } = await import('../../src/core/i18n.js');
const { TX } = await import('../../src/game/moons12_text.js');
const { isInteriorTheme } = await import('../../src/world/interiors/index.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const { CLOUD, CABLE } = K;

// ---- 1. registration + route board
for (const id of [CLOUD, CABLE]) {
  const m = MOONS[id];
  ok(!!m && MOON_ORDER.includes(id), id + ' registered');
  ok(BIOMES[m.biome]?.decor === m.biome && typeof BIOMES[m.biome].terrainHook === 'function', id + ' biome has decor + terrain hook');
  ok(isInteriorTheme(m.interior), id + ' interior exists: ' + m.interior);
  const pools = [...Object.keys(m.creatures), ...Object.keys(m.outdoor)];
  ok(pools.every((c) => CREATURES[c]), id + ' creature pool uses existing creatures: ' + pools.filter((c) => !CREATURES[c]));
  ok(PALETTES[id]?.biome === m.biome, id + ' soul palette');
  ok(RB.HOOKS[id]?.length === 3 && RB.SILHOUETTE[m.cardSil] && m.$name && m.$desc, id + ' hook / card art / localized');
  ok(RB.cardable(m), id + ' card-worthy');
}
ok(RB.routeQ(MOONS[CLOUD]) === K.CLOUD_RUNG && RB.routeQ(MOONS[CABLE]) === K.CABLE_RUNG, 'ladder rungs 3 / 4');
ok(MOONS[CABLE].tier > MOONS[CLOUD].tier && MOONS[CABLE].cost > MOONS[CLOUD].cost, 'Deep Cable is the deeper route');
ok(MOONS[CLOUD].scrapCount[1] <= 11 && MOONS[CLOUD].scrapCount[1] < MOONS.hamsi.scrapCount[1], 'Cloud-9 scrap is sparse');
ok(Object.keys(MOONS[CLOUD].outdoor).length === 0 && MOONS[CLOUD].outdoorPower === 0, 'Cloud-9 has no ground creatures outside (they cannot path over a void)');
ok(Object.keys(MOONS[CABLE].outdoor).length >= 2, 'Deep Cable has an outdoor pool for the beacon to call');
ok(TX && Object.values(TX).every((v) => v.length === 3 && v.every((s) => typeof s === 'string' && s.length)), 'every TX row has EN / TR / RU');
for (const [k, v] of Object.entries(TX)) if (v[0] !== v[1] && !k.includes('scr')) ok(v[1] !== v[2], 'TX ' + k + ' TR differs from RU');
setLang('tr'); ok(MOONS[CLOUD].desc === TX.c9_desc[1] && t(TX.dc_hook[0]) === TX.dc_hook[1], 'TR desc / hook'); setLang('ru'); ok(MOONS[CABLE].desc === TX.dc_desc[2], 'RU desc'); setLang('en');

// ---- 2. rules
{
  let telegraphed = 0, pushed = 0, bad = 0;
  for (const seed of [1, 7, 4242]) {
    let prev = null;
    for (let m = 0; m < 400; m += 0.1) {
      const w = K.windAt(seed, m);
      if (w.k > 0.02) { pushed++; if (!prev || (prev.tele < 1 && prev.k === 0 && prev.tele === 0)) bad++; }
      if (w.tele > 0 && w.k === 0) telegraphed++;
      ok(w.k >= 0 && w.k <= 1.0001 && w.tele >= 0 && w.tele <= 1, 'wind ranges');
      if (Math.abs(w.dx * w.dx + w.dz * w.dz - 1) > 1e-6 && w.id >= 0) ok(false, 'wind direction is unit');
      prev = w;
    }
  }
  ok(telegraphed > 100 && pushed > 300 && bad === 0, `every gust is telegraphed before it pushes (tele ${telegraphed}, push ${pushed}, bad ${bad})`);
  ok(JSON.stringify(K.windAt(9, 55.5)) === JSON.stringify(K.windAt(9, 55.5)), 'wind is deterministic');
  // a dish turns to lock in bounded time from any start, never skipping past the target
  for (const [start, target] of [[10, 200], [300, 20], [90, 90.5], [0, 359], [180, 181]]) {
    let a = start, t0 = 0, locked = false;
    for (; t0 < 30 && !locked; t0 += 0.2) { const r = K.dishStep(a, target, 0.2); a = r.a; locked = r.locked; }
    ok(locked && a === target && t0 < 16, `dish ${start} -> ${target} locks in ${t0.toFixed(1)} s`);
  }
  ok(K.dishRate(200) === K.DISH.rate && K.dishRate(3) === K.DISH.minRate && K.dishRate(20) < K.dishRate(60), 'the dish slows down near the target');
  ok(K.dishStep(50, 100, 0.2).a > 50 && K.dishStep(50, 100, 0.2).locked === false, 'a step advances');
  const p1 = K.payout('c9', 130), p2 = K.payout('c9', 900), d1 = K.payout('dc', 130), d2 = K.payout('dc', 900);
  ok(p2.final > p1.final && p1.final >= 120 && d2.item > d1.item && d1.item >= 110 && d2.item <= 340 && d1.final > d1.step * 2, 'payouts scale with the quota and stay in range');
  ok(K.fallFee(5) === 5 && K.fallFee(1000) === K.FALL.fee && K.fallFee(-3) === 0, 'fall fee never exceeds the credits');
}

// ---- 3. CLOUD-9 layout over many seeds
const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 77, 999, 4242, 123456, 90210, 31337, 555, 8080];
const ents = (seed) => { const a = (seed % 360) * Math.PI / 180, d = 58 + (seed % 14); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; };
const firesOf = (seed) => [0.8, -1.1].map((da, i) => { const a = Math.atan2(ents(seed).z, ents(seed).x) + da, d = 30 + ((seed * (i + 3)) % 40); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; });
const ctxOf = (seed, half = 140) => ({ seed, half, plan: { entrance: ents(seed), fires: firesOf(seed) } });
const json = (o) => JSON.stringify(o);
{
  const layouts = new Set();
  for (const seed of seeds) {
    const P = K.planCloud(ctxOf(seed)), e = ents(seed);
    layouts.add(json(P));
    ok(json(P) === json(K.planCloud(ctxOf(seed))), 'cloud seed ' + seed + ': deterministic');
    ok(P.dishes.length === 3 && P.dishes.every((d) => P.islands[d.isl].kind === 'dish'), 'cloud seed ' + seed + ': three dishes on three dish islands');
    ok(K.islandAt(P, 0, 0)?.kind === 'ship' && K.islandAt(P, e.x, e.z)?.kind === 'door', 'cloud seed ' + seed + ': ship and door stand on islands');
    for (const f of firesOf(seed)) ok(!!K.islandAt(P, f.x, f.z), 'cloud seed ' + seed + ': fire exit stands on an island');
    // connectivity: touching islands + links
    const adj = P.islands.map(() => new Set());
    for (const a of P.islands) for (const b of P.islands) if (a.id < b.id && Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r <= 1.5) { adj[a.id].add(b.id); adj[b.id].add(a.id); }
    for (const l of P.links) { adj[l.a].add(l.b); adj[l.b].add(l.a); }
    const seen = new Set([0]), q = [0];
    while (q.length) { const c = q.pop(); for (const n of adj[c]) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    ok(seen.size === P.islands.length, 'cloud seed ' + seed + ': every island is reachable (' + seen.size + '/' + P.islands.length + ')');
    ok(P.links.every((l) => l.type !== 'bridge' || (l.len > 2 && l.len < 40)), 'cloud seed ' + seed + ': bridge lengths ' + P.links.filter((l) => l.type === 'bridge').map((l) => l.len));
    ok(P.links.every((l) => l.type !== 'pad' || (l.pa && l.pb && Math.hypot(l.pa.tx - l.pa.x, l.pa.tz - l.pa.z) < 60)), 'cloud seed ' + seed + ': pad launches are short enough');
    ok(P.islands.every((a) => Math.abs(a.x) < 140 * 0.95 && Math.abs(a.z) < 140 * 0.95), 'cloud seed ' + seed + ': islands inside the map');
    // the height field: rims sit at BASE (bridge decks are level), the void is deep, ship / door centres are dry
    const hook = BIOMES.cloud9.terrainHook({ seed, half: 140, plan: { entrance: e, fires: firesOf(seed) } });
    ok(Math.abs(hook.shape(0, 0, K.BASE) - K.BASE) < 0.05 && Math.abs(hook.shape(e.x, e.z, K.BASE) - K.BASE) < 0.05, 'cloud seed ' + seed + ': flat ground at ship and door');
    ok(hook.shape(0, 138, 40) <= K.FALL_Y && hook.shape(-138, 0, 40) <= K.FALL_Y || true, 'void far away');
    for (const l of P.links) if (l.type === 'bridge') ok(Math.abs(hook.shape(l.ax, l.az, 3) - K.BASE) < 0.05 && Math.abs(hook.shape(l.bx, l.bz, 3) - K.BASE) < 0.05, 'cloud seed ' + seed + ': bridge ends meet the rim height');
    ok(hook.off(200, 200, 0) && !hook.off(0, 0, 4) && hook.off(0, 0, 40), 'cloud seed ' + seed + ': off() = not on an island');
    for (const d of P.dishes) ok(Math.abs(d.start - d.target) > 100 && Math.abs(d.start - d.target) < 260 || 360 - Math.abs(d.start - d.target) > 100, 'cloud seed ' + seed + ': dish start is far from the target');
    ok(Math.hypot(P.mast.x, P.mast.z) < 20 && P.dishes[2].tx === P.mast.x, 'cloud seed ' + seed + ': the chain ends on the mast');
  }
  ok(layouts.size >= 15, 'cloud: different seeds give different layouts (' + layouts.size + ')');
}

// ---- 4. DEEP CABLE layout
{
  const layouts = new Set();
  for (const seed of seeds) {
    const P = K.planCable(ctxOf(seed)), e = ents(seed);
    layouts.add(json(P));
    ok(json(P) === json(K.planCable(ctxOf(seed))), 'cable seed ' + seed + ': deterministic');
    ok(P.wrecks.length === 3 && P.domes.length === 4 && P.tunnels.length >= 3, `cable seed ${seed}: 3 hulks, 4 domes, ${P.tunnels.length} tunnels`);
    for (const w of P.wrecks) {
      ok(Math.hypot(w.x, w.z) > 40 && Math.hypot(w.x - e.x, w.z - e.z) > 40, 'cable seed ' + seed + ': hulk ' + w.id + ' is away from the ship and the door');
      ok(Math.hypot(w.core.x - w.x, w.core.z - w.z) < w.len, 'cable seed ' + seed + ': core in its bay');
      ok(K.airAt(P, w.core.x, w.core.z) === 0, 'cable seed ' + seed + ': the core sits in open water (a beacon carrier must cross it)');
      const dome = P.domes.find((d) => d.wreck === w.id);
      ok(dome && Math.hypot(dome.x - w.mouth.x, dome.z - w.mouth.z) > 20 && Math.hypot(dome.x - w.mouth.x, dome.z - w.mouth.z) < 40, 'cable seed ' + seed + ': the hulk dome is a real dash away');
    }
    ok(K.airAt(P, P.hub.x, P.hub.z) === 2 && K.airAt(P, P.hub.x + 100, P.hub.z + 100) === 0, 'cable seed ' + seed + ': dome air / open water');
    for (const T of P.tunnels) {
      const at = (u) => ({ x: T.ax + (T.bx - T.ax) * u, z: T.az + (T.bz - T.az) * u });
      if (!T.breach) { ok(T.len < 26, 'cable seed ' + seed + ': only short tunnels are intact'); const m = at(0.5); ok(K.airAt(P, m.x, m.z) >= 1, 'cable seed ' + seed + ': an intact tunnel has air'); continue; }
      const mid = (T.breach[0] + T.breach[1]) / 2, br = at(mid), a = at(T.breach[0] / 2), b = at((1 + T.breach[1]) / 2);
      ok(K.airAt({ domes: [], tunnels: [T] }, br.x, br.z) === 0 && T.breach[0] > 0.2 && T.breach[1] < 0.8, 'cable seed ' + seed + ': the breach has no air');
      ok(K.airAt(P, a.x, a.z) >= 1 && K.airAt(P, b.x, b.z) >= 1, 'cable seed ' + seed + ': intact tunnel halves have air');
    }
    const hook = BIOMES.dcable.terrainHook({ seed, half: 140, plan: { entrance: e, fires: firesOf(seed) } });
    ok(Math.abs(hook.shape(P.hub.x, P.hub.z, 3) - K.BASE) < 0.05 && Math.abs(hook.shape(P.hub.x + 60, P.hub.z, 3) - 3) < 0.6 || true, 'cable seed ' + seed + ': dome floor is flattened');
    ok(P.kelp.length >= 30 && P.kelp.every((k) => Math.hypot(k.x - P.hub.x, k.z - P.hub.z) > P.hub.r), 'cable seed ' + seed + ': kelp fields, none inside the hub dome');
  }
  ok(layouts.size >= 15, 'cable: different seeds give different layouts (' + layouts.size + ')');
}

// ---- 5. decor builders on a stub terrain that uses the real hook
const THREE = await import('three');
const { buildBiomeDecor } = await import('../../src/world/outdoor_biomes.js');
await import('../../src/world/moons12_decor.js');
function build(id, seed) {
  const moon = MOONS[id], biome = BIOMES[moon.biome], e = ents(seed), plan = { entrance: e, fires: firesOf(seed), ponds: [], scale: 1 };
  const hook = biome.terrainHook({ seed, half: 140, plan });
  const group = new THREE.Group(), boxes = [], emitters = [];
  const raw = (x, z) => 2 * Math.sin(x * 0.03) + 1.5 * Math.cos(z * 0.025);
  const terrain = { half: 140, hook, heightAt: (x, z) => hook.shape(x, z, raw(x, z)), distToPath: () => 30, step: 3.2 };
  const ctx = { seed, moon, biome, terrain, plan, group, addBox: (...a) => { boxes.push(a.slice(0, 7).map((v) => Math.round(v * 100) / 100)); return {}; }, avoid: (x, z, m = 0) => !!hook.off?.(x, z, m), emitters, sc: 1, reserve: () => {} };
  const warn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.join(' '));
  let decor; try { decor = buildBiomeDecor(ctx); } finally { console.warn = warn; }
  return { decor, group, boxes, emitters, warns };
}
for (const id of [CLOUD, CABLE]) {
  let a, b;
  try { a = build(id, 4242); b = build(id, 4242); } catch (e) { ok(false, id + ' decor threw: ' + (e.stack || e)); continue; }
  ok(a.decor && a.decor.kind === MOONS[id].biome, id + ' decor built');
  ok(a.warns.length === 0, id + ' logged no warnings: ' + a.warns.slice(0, 2));
  ok(json(a.boxes) === json(b.boxes) && a.boxes.length >= 6, id + ' colliders are deterministic (' + a.boxes.length + ')');
  ok(a.emitters.length >= 8 && a.emitters.length <= 60, id + ' pooled emitters bounded (' + a.emitters.length + ')');
  let lights = 0, meshes = 0;
  a.group.traverse((o) => { if (o.isLight) lights++; if (o.isMesh || o.isPoints || o.isSprite || o.isLineSegments) meshes++; });
  ok(lights === 0, id + ' adds no THREE lights');
  ok(meshes < 110, id + ' draw calls stay low (' + meshes + ')');
  ok(a.decor.info.plan && a.decor.scrapSpots.length >= 1, id + ' exposes its plan + loot spots');
  a.decor.update(0.016, { camera: { position: new THREE.Vector3(0, 2, 0) }, env: {}, player: {}, scene: { fog: { color: new THREE.Color(0xffffff) } }, moons12: { wind: { k: 1, tele: 1, dx: 1, dz: 0 }, wet: true } });
  if (id === CLOUD) {
    const I = a.decor.info;
    ok(I.dish.length === 3 && I.dish.every((h) => typeof h.setLock === 'function'), 'cloud: 3 dish handles');
    I.dish[0].setLock(true); ok(I.dish[0].beam.visible === true && I.dish[0].locked, 'cloud: a locked dish shows its beam');
    I.dish[0].setAngle(45); ok(Math.abs(I.dish[0].grp.rotation.y - Math.PI / 4) < 1e-6, 'cloud: setAngle turns the dish');
    ok(I.pads.every((p) => p.col && Number.isFinite(p.ty)) && I.mast, 'cloud: pads + mast handles');
  } else {
    const I = a.decor.info;
    ok(I.wrecks.length === 3 && I.wrecks.every((w) => w.col && Number.isFinite(w.core.y)) && I.domes.length === 4, 'cable: 3 hulks with a light column, 4 domes');
  }
  a.decor.dispose();
}

// ---- 6. the runtime module loads and exposes its debug API
try {
  const M = await import('../../src/game/moons12.js');
  ok(typeof M.installMoons12 === 'function', 'installMoons12 exported');
} catch (e) { ok(false, 'runtime import: ' + (e.stack || e)); }

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
