// MOONS10 test (wave 10, docs/wave10/moons10.md): the two new moons are registered with sane route-board data, their landmark layout is deterministic per seed,
// the decor builders run without throwing on a stub terrain (merged geometry, constant light count, deterministic colliders), and the route board lists them.
// Run: node tools/harness/moons10.test.mjs
globalThis.window = globalThis.window || {};
const C10 = await import('../../src/game/moons10_core.js');
const { MOONS, MOON_ORDER, BIOMES } = await import('../../src/game/moons.js');
const RB = await import('../../src/game/routeboard_core.js');
const { setInteriorProbe } = await import('../../src/game/moongen.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const { PALETTES } = await import('../../src/game/soul_core.js');
const { setLang, t } = await import('../../src/core/i18n.js');
const { TX } = await import('../../src/game/moons10_text.js');
await import('../../src/world/maps5_data.js');
await import('../../src/world/worlds2_data.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const { TUNDRA, FEED } = C10;

// ---- 1. registration
for (const id of [TUNDRA, FEED]) {
  const m = MOONS[id];
  ok(!!m && MOON_ORDER.includes(id), id + ' registered in MOONS + MOON_ORDER');
  ok(BIOMES[m.biome] && BIOMES[m.biome].decor === m.biome, id + ' biome exists and its decor kind is its own id');
  ok(BIOMES[m.biome].name && BIOMES[m.biome].sky != null && BIOMES[m.biome].fog != null && BIOMES[m.biome].dusk != null, id + ' biome carries a palette (sky / fog / dusk)');
  ok(Array.isArray(m.scrapCount) && m.scrapCount[0] < m.scrapCount[1] && m.scrapMul > 1, id + ' scrap numbers');
  ok(m.tier >= 3 && m.cost > 0 && m.size > 1, id + ' tier / cost / size');
  const pools = [...Object.keys(m.creatures), ...Object.keys(m.outdoor)];
  ok(pools.every((c) => CREATURES[c]), id + ' creature pool uses existing creatures: ' + pools.filter((c) => !CREATURES[c]));
  ok(m.weather.length >= 4, id + ' weather set');
  ok(PALETTES[id]?.biome === m.biome, id + ' has a named soul palette (no seeded hue shift)');
  ok(!!RB.HOOKS[id] && RB.HOOKS[id].length === 3 && RB.HOOKS[id].every((s) => s.length > 20), id + ' route-board hook EN / TR / RU');
  ok(RB.SILHOUETTE[m.cardSil] && RB.silhouetteOf(m.cardSil) === RB.SILHOUETTE[m.cardSil], id + ' has its own card silhouette');
  ok(m.$name && m.$desc, id + ' name / desc localized');
}
ok(MOONS[TUNDRA].tier > MOONS[FEED].tier && MOONS[TUNDRA].cost > MOONS[FEED].cost && MOONS[TUNDRA].scrapMul > MOONS[FEED].scrapMul, '503 is the deeper route (tier / cost / payout above the Feed)');
ok(MOONS[TUNDRA].scrapMul < MOONS.orkinos.scrapMul && MOONS[FEED].scrapMul <= MOONS.cipura.scrapMul, 'payout stays below the neighbours on the ladder (404 / Creepypasta)');

// ---- 2. interiors: feature-detected, fall back to the factory
ok(MOONS[TUNDRA].interior === 'factory' && MOONS[FEED].interior === 'factory', 'no probe: both moons fall back to the factory interior');
setInteriorProbe((id) => id === 'funhouse');
ok(MOONS[TUNDRA].interior === 'funhouse' && MOONS[FEED].interior === 'factory', 'funhouse registered: 503 uses it, the Feed still falls back');
setInteriorProbe((id) => id === 'funhouse' || id === 'deadmall');
ok(MOONS[TUNDRA].interior === 'funhouse' && MOONS[FEED].interior === 'deadmall', 'both registered: funhouse / deadmall');
setInteriorProbe(() => { throw new Error('probe broke'); });
ok(MOONS[TUNDRA].interior === 'factory', 'a throwing probe never crashes the moon');
setInteriorProbe(null);

// ---- 3. route board: ladder rung, hooks, cards
ok(RB.routeQ(MOONS[FEED]) === C10.FEED_RUNG && RB.LADDER.find((s) => s.q === C10.FEED_RUNG).ids.includes(FEED), 'the Feed sits on the quota-3 rung');
ok(RB.routeQ(MOONS[TUNDRA]) === RB.LATE_Q, '503 waits for the Deep Feed (quota ' + RB.LATE_Q + ')');
ok(RB.nextStep(2).ids.includes(FEED), 'the footer for quota 2 names the Feed');
ok(!RB.routeOpen(MOONS[FEED], { all: false, q: 2 }) && RB.routeOpen(MOONS[FEED], { all: false, q: 3 }), 'the Feed opens at quota 3');
ok(!RB.routeOpen(MOONS[TUNDRA], { all: false, q: 4 }) && RB.routeOpen(MOONS[TUNDRA], { all: false, q: 5 }), '503 opens at quota 5');
ok(RB.routeOpen(MOONS[TUNDRA], null) && RB.routeOpen(MOONS[FEED], { all: true, q: 0 }), 'veterans / unlock-everything see both');
ok(RB.openedAt(MOON_ORDER.map((i) => MOONS[i]), 3).includes(FEED), 'the "NEW ROUTES" toast at quota 3 includes the Feed');
const moons = MOON_ORDER.map((i) => MOONS[i]).filter(Boolean);
ok(RB.cardable(MOONS[FEED]) && RB.cardable(MOONS[TUNDRA]), 'both are card-worthy');
const shown = new Set();
for (let day = 1; day <= 40; day++) for (const q of [3, 5]) for (const m of RB.pickCards(moons, { all: false, q }, { moon: 'hamsi', seed: 7, day })) shown.add(m.id);
ok(shown.has(FEED) && shown.has(TUNDRA), 'over 40 days the board offers both moons (quota 3 / 5): ' + [...shown]);
ok(RB.pickCards(moons, { all: false, q: 3 }, { moon: 'hamsi', seed: 9, day: 1 }).some((m) => m.id === FEED), 'the quota-3 board shows the fresh Feed card at once');
const lo = RB.payout(MOONS[FEED], 3, [40, 60]), hi = RB.payout(MOONS[TUNDRA], 5, [40, 60]);
ok(lo[0] > 0 && lo[1] > lo[0] && hi[1] > hi[0], 'payout ranges');
ok(RB.hookOf(MOONS[FEED]) === TX.feed_hook[0] && RB.hookOf(MOONS[TUNDRA]) === TX.x503_hook[0], 'hookOf returns the EN hook');

// ---- 4. text: TR + RU for every entry, no placeholder leftovers
for (const [k, v] of Object.entries(TX)) {
  ok(v.length === 3 && v.every((s) => typeof s === 'string' && s.length > 0), 'TX ' + k + ' has EN / TR / RU');
  if (!/^(scr_503|scr_kidding)$/.test(k) && v[0] !== v[1]) ok(v[1] !== v[2], 'TX ' + k + ': TR and RU differ');
}
ok(/[Ѐ-ӿ]/.test(TX.x503_desc[2]) && /[Ѐ-ӿ]/.test(TX.feed_note[2]), 'RU strings are Cyrillic');
setLang('tr'); ok(t(TX.feed_hook[0]) === TX.feed_hook[1] && MOONS[FEED].desc === TX.feed_desc[1], 'TR: hook + moon desc translated');
setLang('ru'); ok(t(TX.x503_hook[0]) === TX.x503_hook[2] && MOONS[TUNDRA].desc === TX.x503_desc[2], 'RU: hook + moon desc translated');
setLang('en'); ok(MOONS[TUNDRA].desc === TX.x503_desc[0], 'EN desc');

// ---- 5. deterministic landmark placement
const ent = { x: 40, z: -45 };
const seg = (x, z) => { const L = Math.hypot(ent.x, ent.z), t0 = Math.max(0, Math.min(1, (x * ent.x + z * ent.z) / (L * L))); return Math.hypot(x - ent.x * t0, z - ent.z * t0); };
const ctxFor = (seed) => ({ seed, half: 138, entrance: ent, pathDist: seg });
const json = (o) => JSON.stringify(o);
for (const [name, plan, must] of [['tundra', C10.planTundra, ['towers', 'halls', 'dish', 'hut', 'racks', 'drifts']], ['feed', C10.planFeed, ['giant', 'slabs', 'plug', 'cable', 'badges', 'beat']]]) {
  ok(json(plan(ctxFor(12345))) === json(plan(ctxFor(12345))), name + ': same seed, same layout');
  const layouts = new Set();
  for (const seed of [1, 2, 3, 4, 5, 77, 999, 123456]) {
    const P = plan(ctxFor(seed)); layouts.add(json(P));
    for (const k of must) ok(Array.isArray(P[k]) ? P[k].length > 0 : !!P[k], `${name} seed ${seed}: ${k} placed`);
    const spots = [];
    const push = (o, r = 0) => { if (o && Number.isFinite(o.x) && Number.isFinite(o.z)) spots.push({ x: o.x, z: o.z, r, o }); else ok(false, `${name} seed ${seed}: non-finite spot`); };
    if (name === 'tundra') { P.towers.forEach((o) => push(o, o.r)); P.halls.forEach((o) => push(o, 14)); push(P.dish, 20); push(P.hut, 4); P.racks.forEach((o) => push(o, 1)); }
    else { push(P.giant, 16); P.slabs.forEach((o) => push(o, o.w / 2)); push(P.plug, 3); push(P.beat?.chair, 1); }
    ok(spots.every((s) => Math.hypot(s.x, s.z) > 20 + s.r * 0.5), `${name} seed ${seed}: nothing inside the ship clearing`);
    ok(spots.every((s) => Math.hypot(s.x - ent.x, s.z - ent.z) > 14), `${name} seed ${seed}: nothing on the entrance`);
    ok(spots.every((s) => Math.abs(s.x) < 138 && Math.abs(s.z) < 138), `${name} seed ${seed}: inside the map`);
    if (name === 'tundra') {
      ok(P.towers.every((a, i) => P.towers.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > a.r + b.r)), `tundra seed ${seed}: towers do not overlap`);
      ok(!P.hut || Math.hypot(P.hut.x - P.dish.x, P.hut.z - P.dish.z) < 34, `tundra seed ${seed}: the hut sits at the dish`);
      ok(P.scrap.length >= 1, `tundra seed ${seed}: loot spots`);
    } else {
      ok(P.slabs.length >= 12, `feed seed ${seed}: at least 12 monoliths (${P.slabs.length})`);
      ok(P.slabs.some((s) => s.live) && P.slabs.some((s) => !s.live), `feed seed ${seed}: some screens live, some dead`);
      ok(P.slabs.every((s) => s.variant >= 0 && s.variant <= 6), `feed seed ${seed}: valid screen variants`);
      const g = P.giant, ea = Math.atan2(ent.z, ent.x), ga = Math.atan2(g.z, g.x);
      ok(Math.hypot(g.x, g.z) > 90 && Math.abs(Math.atan2(Math.sin(ga - ea), Math.cos(ga - ea))) < 0.7, `feed seed ${seed}: the colossus stands beyond the entrance, near the horizon`);
      ok(P.cable.length > 10 && Math.hypot(P.cable.at(-1).x - P.plug.x, P.cable.at(-1).z - P.plug.z) < 0.5, `feed seed ${seed}: the cable ends at the plug`);
      const b = P.beat; ok(b && Math.hypot(b.slab.x - b.chair.x, b.slab.z - b.chair.z) > 5 && seg(b.chair.x, b.chair.z) >= 13, `feed seed ${seed}: the seated figure is off the path, facing its slab`);
    }
  }
  ok(layouts.size >= 7, name + ': different seeds give different layouts (' + layouts.size + ' / 8)');
}
ok(C10.planFor(TUNDRA, ctxFor(5)).towers.length === 3 && C10.planFor('nope', ctxFor(5)) === null, 'planFor dispatch');
ok(json(C10.planTundra({ ...ctxFor(5), avoid: () => true }).towers) === '[]', 'an avoid() that rejects everything places nothing and does not throw');

// ---- 6. the decor builders run on a stub terrain (three.js only; no DOM) - merged geometry, constant lights, deterministic colliders
const THREE = await import('three');
const { buildBiomeDecor } = await import('../../src/world/outdoor_biomes.js');
await import('../../src/world/moons10_decor.js');
function build(id, seed) {
  const moon = MOONS[id], biome = BIOMES[moon.biome];
  const group = new THREE.Group(), boxes = [], emitters = [], reserved = [];
  const terrain = { half: 138, heightAt: (x, z) => 3 * Math.sin(x * 0.03) + 2 * Math.cos(z * 0.025), distToPath: seg, step: 3.2 };
  const ctx = { seed, moon, biome, terrain, plan: { entrance: ent, fires: [], ponds: [], scale: 1 }, group, addBox: (...a) => { boxes.push(a.slice(0, 7).map((v) => Math.round(v * 100) / 100)); return {}; }, avoid: (x, z, m = 0) => Math.hypot(x, z) < 20 + m || Math.hypot(x - ent.x, z - ent.z) < 15 + m || seg(x, z) < 5 + m || reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + m), emitters, sc: 1, reserve: (x, z, r) => reserved.push({ x, z, r }) };
  const warn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.join(' '));
  let decor; try { decor = buildBiomeDecor(ctx); } finally { console.warn = warn; }
  return { decor, group, boxes, emitters, warns, reserved };
}
for (const id of [TUNDRA, FEED]) {
  let a, b;
  try { a = build(id, 4242); b = build(id, 4242); } catch (e) { ok(false, id + ' decor builder threw: ' + (e.stack || e)); continue; }
  ok(a.decor && a.decor.kind === MOONS[id].biome, id + ' decor built');
  ok(a.warns.filter((w) => !/decor prop|propfactory|canvas/i.test(w)).length === 0, id + ' decor logged no warnings: ' + a.warns.slice(0, 2));
  ok(json(a.boxes) === json(b.boxes) && a.boxes.length > 20, id + ' colliders are deterministic and plentiful (' + a.boxes.length + ')');
  ok(json(a.emitters.map((e) => [e.pos.x, e.pos.y, e.pos.z, e.color])) === json(b.emitters.map((e) => [e.pos.x, e.pos.y, e.pos.z, e.color])), id + ' pooled emitters are deterministic');
  ok(a.emitters.length >= 8 && a.emitters.length <= 40, id + ' light count is bounded (pooled emitters: ' + a.emitters.length + ')');
  let lights = 0, meshes = 0, tris = 0;
  a.group.traverse((o) => { if (o.isLight) lights++; if (o.isMesh || o.isPoints || o.isSprite) meshes++; if (o.isMesh && o.geometry?.attributes?.position) tris += o.geometry.attributes.position.count / 3; });
  ok(lights === 0, id + ' adds no THREE lights');
  ok(meshes < 60, id + ' draw calls stay low (' + meshes + ' objects)');
  ok(a.decor.info.notes.length === 1 && Number.isFinite(a.decor.info.notes[0].x), id + ' has one story-beat note');
  ok(a.decor.scrapSpots.length >= 1, id + ' loot spots at the story beat');
  ok(a.reserved.length >= 3, id + ' reserves its landmark footprints');
  // a few frames of the visuals must not throw (camera stub)
  try { const game = { camera: { position: new THREE.Vector3(10, 2, 10) }, env: { indoor: false }, player: {}, audio: { has: () => false, at() {}, setAmbience() {} } }; for (let i = 0; i < 30; i++) a.decor.update(0.1, game); } catch (e) { ok(false, id + ' update threw ' + e.stack); }
  a.decor.dispose();
  ok(a.group.children.length === 0, id + ' dispose removes everything from the group');
  console.log(`  ${id}: ${a.boxes.length} colliders, ${a.emitters.length} emitters, ${meshes} scene objects, ${Math.round(tris)} tris`);
}

// ---- 7. the canvas painters run for every screen / language on a fake 2D context (no DOM here)
{
  const { PAINT } = await import('../../src/world/moons10_decor.js');
  const mk = () => new Proxy({ measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), calls: 0 }, {
    get(o, k) { if (k in o) return o[k]; return (...a) => { o.calls++; }; }, set() { return true; },
  });
  let rn = 0; const rnd = () => ((rn = (rn * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const lang of ['en', 'tr', 'ru']) {
    for (let v = 0; v < 7; v++) { const c = mk(); try { PAINT.drawScreen(c, 96, 200, v, lang, rnd); ok(c.calls > 8, `screen ${v} ${lang} painted`); } catch (e) { ok(false, `screen ${v} ${lang} threw ${e.message}`); } }
    for (const mode of [0, 1]) { const c = mk(); try { PAINT.drawGiant(c, 256, 512, mode, lang, rnd); ok(c.calls > 4, `giant ${mode} ${lang} painted`); } catch (e) { ok(false, `giant ${mode} ${lang} threw ${e.message}`); } }
  }
}

console.log(fails ? `moons10: ${fails} FAILED of ${checks}` : `moons10: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
