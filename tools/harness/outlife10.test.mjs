// [outlife10] node test for src/game/outlife10_core.js + outlife10_art.js: same seed -> same layout, ship / path / entrance / fire-exit / pond clearance,
// instance counts per biome family, collider budget, draw-call budget of the built meshes, EN/TR/RU text.   node tools/harness/outlife10.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));
globalThis.window = globalThis;
const warns = [];
console.warn = console.error = (...a) => { warns.push(a.map(String).join(' ')); };
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const assert = (await import('node:assert/strict')).default;
const { buildMoonOutdoor } = await import('../../src/world/terrain.js');
const { MOONS } = await import('../../src/game/moons.js');
const C = await import('../../src/game/outlife10_core.js');
const A = await import('../../src/game/outlife10_art.js');
const { setLang, getLang } = await import('../../src/core/i18n.js');
let pass = 0, fail = 0;
const pending = [];
const fmt = (e) => (e.stack || e.message).split('\n').slice(0, 5).join('\n       ');
const ok = (name, fn) => {
  const good = () => { pass++; console.log('  ok   ' + name); }, bad = (e) => { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + fmt(e)); };
  try { const r = fn(); if (r && r.then) pending.push(r.then(good, bad)); else good(); } catch (e) { bad(e); }
};
const NAMED = ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'];
const lightPool = { add(e) { return e; }, remove() {} };
const mkPhysics = () => ({ addStaticBox() { return {}; }, removeCollider() {}, addStaticTrimesh() { return {}; } });

/** the same inputs outlife10.js hands to planOutlife (trees, rocks, outposts, scrap spots) */
function planFor(out, moonId, biomeId, seed) {
  const T = out.terrain, plan = out.plan, b = plan.biome || {}, hard = [];
  for (const t of out.harvest?.trees || []) hard.push({ x: t.x, z: t.z, r: 1.5 * (t.scale || 1) + 0.5 });
  for (const t of out.harvest?.rocks || []) hard.push({ x: t.x, z: t.z, r: 1.7 * (t.scale || 1) + 0.6 });
  for (const s of out.outposts?.sites || []) hard.push({ x: s.x, z: s.z, r: (s.radius || 8) + 3 });
  for (const s of out.outdoorScrapSpots || []) hard.push({ x: s.x, z: s.z, r: 2.6 });
  return C.planOutlife({ seed, moonId, biomeId, decor: b.decor, sc: T.scale || 1, half: T.half, plan, pathPts: T.pathPts, heightAt: (x, z) => T.heightAt(x, z), distToPath: (x, z) => T.distToPath(x, z), avoid: out.avoid, solidAt: out.solidAt,
    lavaDepthAt: T.lava ? (x, z) => T.lavaDepthAt(x, z) : null, floodY: b.flood ?? null, obstacles: hard, soft: [] });
}
const outFor = (moonId, seed, biome) => { const moon = { ...MOONS[moonId], biome: biome || MOONS[moonId].biome }; return { out: buildMoonOutdoor(seed, moon, { physics: mkPhysics(), lightPool }), moon }; };

ok('deterministic: same (moon, seed) -> identical plan and skyline; another seed -> another layout', () => {
  const { out } = outFor('hamsi', 1234), a = planFor(out, 'hamsi', 'hills', 1234), b = planFor(out, 'hamsi', 'hills', 1234), o2 = outFor('hamsi', 999).out, c = planFor(o2, 'hamsi', 'hills', 999);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.rocks.map((r) => r.x), c.rocks.map((r) => r.x));
  assert.deepEqual(C.skylineSpecs('hills', 5, 1, 260), C.skylineSpecs('hills', 5, 1, 260));
  assert.notDeepEqual(C.skylineSpecs('hills', 5, 1, 260).shapes[0], C.skylineSpecs('hills', 6, 1, 260).shapes[0]);
});

ok('clearance: nothing on the ship pad, the walk to the entrance, the entrance, fire exits, ponds / lakes or in water (6 moons x 2 seeds)', () => {
  let n = 0;
  for (const id of NAMED) for (const seed of [1234, 987]) {
    const { out, moon } = outFor(id, seed), P = planFor(out, id, moon.biome, seed), T = out.terrain, e = out.plan.entrance, fl = out.plan.biome.flood;
    const all = [...P.rocks.map((r) => ['rock', r, Math.max(r.sx, r.sz)]), ...P.tufts.map((r) => ['tuft', r, 0]), ...P.snags.map((r) => ['snag', r, 1]), ...P.stumps.map((r) => ['stump', r, 0.6]), ...P.pois.map((r) => ['poi', r, C.POI_R]), ...P.fog.map((r) => ['fog', r, r.r * 0.4])];
    for (const [kind, it, rad] of all) {
      n++;
      const d = Math.hypot(it.x, it.z), tag = `${id}/${seed} ${kind}`;
      assert.ok(Number.isFinite(it.x + it.z), tag + ' nan');
      assert.ok(d > 22, `${tag} ${d.toFixed(1)} m from the ship`);
      assert.ok(Math.hypot(it.x - e.x, it.z - e.z) > 17, tag + ' at the entrance');
      for (const f of out.plan.fires) assert.ok(Math.hypot(it.x - f.x, it.z - f.z) > 11, tag + ' at a fire exit');
      for (const p of out.plan.ponds) assert.ok(Math.hypot(it.x - p.x, it.z - p.z) > p.r * 1.4, tag + ' in a pond');
      for (const l of out.plan.lakes) assert.ok(Math.hypot(it.x - l.x, it.z - l.z) > l.r, tag + ' on a lake');
      const dp = T.distToPath(it.x, it.z), need = { rock: it.col ? 18 : 3, tuft: 2.5, snag: 6, stump: 4, poi: 12, fog: 0 }[kind];
      assert.ok(dp >= need, `${tag} ${dp.toFixed(1)} m from the path (< ${need})`);
      if (fl != null && kind !== 'fog') assert.ok(T.heightAt(it.x, it.z) > fl + 0.2, tag + ' under water');
      if (kind === 'poi') assert.ok(P.pois.every((q) => q === it || Math.hypot(q.x - it.x, q.z - it.z) > 20), tag + ' crowded');
    }
    for (const q of out.outposts?.sites || []) for (const p of P.pois) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) > (q.radius || 5), `${id}/${seed} poi inside an outpost`);
  }
  assert.ok(n > 1500, 'too few items checked: ' + n);
});

ok('counts per biome family: ground cover, dead wood, 3-9 POIs of >= 3 kinds, fog pools, <= 12 colliders (10 outdoor families, pier = HQ floor has no terrain)', () => {
  assert.ok(C.PROFILES.pier && C.FAMILIES.length === 11);
  for (const fam of C.FAMILIES.filter((f) => f !== 'pier')) {
    const biome = fam, { out, moon } = outFor('hamsi', 4321, biome), P = planFor(out, 'hamsi', biome, 4321), pf = C.PROFILES[fam];
    assert.equal(P.family, fam);
    assert.ok(P.rocks.filter((r) => r.kind === 'rock').length >= Math.min(8, pf.rocks * 0.3), `${fam} rocks ${P.rocks.length}`);
    if (pf.mounds) assert.ok(P.rocks.filter((r) => r.kind === 'mound').length >= 4, `${fam} mounds`);
    if (pf.tufts[0] + pf.tufts[1] > 0) assert.ok(P.tufts.length >= 40, `${fam} tufts ${P.tufts.length}`);
    if (pf.snags) assert.ok(P.snags.length >= 3, `${fam} snags ${P.snags.length}`);
    assert.ok(P.pois.length >= 3 && P.pois.length <= 9, `${fam} pois ${P.pois.length}`);
    assert.ok(new Set(P.pois.map((p) => p.kind)).size >= 3, `${fam} poi kinds`);
    assert.ok(P.fog.length >= 1, `${fam} fog ${P.fog.length}`);
    assert.ok(P.colliders <= 12 && P.rocks.filter((r) => r.col).length === P.colliders, `${fam} colliders ${P.colliders}`);
    assert.equal(!!P.fx, !!pf.fx, fam + ' fx');
    assert.ok(P.rocks.length + P.tufts.length + P.snags.length + P.stumps.length < 1400, fam + ' too many instances');
  }
});

ok('meshes: <= 13 draw calls per moon (rocks, 2 tufts, snag, stump, 2 poi, fog, skyline, beacons), finite geometry, instance counts match the plan', () => {
  for (const fam of ['hills', 'snow', 'blackforest', 'desert', 'servermarsh']) {
    const { out } = outFor('hamsi', 77, fam), P = planFor(out, 'hamsi', fam, 77);
    const objs = [A.rocksMesh(P.rocks), ...A.tuftMeshes(P.tufts, P.profile), ...A.woodMeshes(P.snags, P.stumps), ...A.poiMeshes(P.pois, (x, z) => out.terrain.heightAt(x, z), 77), A.fogMesh(P.fog), ...A.skylineMeshes(C.skylineSpecs(fam, 77, out.terrain.scale, 260))].filter(Boolean);
    assert.ok(objs.length >= 6 && objs.length <= 13, `${fam}: ${objs.length} draw calls`);
    for (const o of objs) {
      const a = o.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 97) assert.ok(Number.isFinite(a[i]), `${fam} ${o.name} nan`);
      if (o.isInstancedMesh) assert.ok(o.count > 0, o.name + ' empty');
    }
    const rocks = objs.find((o) => o.name === 'ol-rocks');
    assert.ok(rocks.count >= P.colliders && rocks.count <= P.rocks.length, `${fam} rock instances ${rocks.count}/${P.rocks.length}`);
    assert.ok(objs.some((o) => o.name === 'ol-poi') && objs.some((o) => o.name === 'ol-skyline'), fam + ' poi / skyline missing');
    const sk = C.skylineSpecs(fam, 77, 1, 260);
    assert.ok(sk.shapes.length >= 40 && sk.beacons.length >= 4, `${fam} skyline ${sk.shapes.length} shapes / ${sk.beacons.length} beacons`);
    for (const o of objs) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); }
  }
});

ok('text: every POI line has EN + TR + RU', () => {
  C.registerOutlifeText();
  const prev = getLang();
  try {
    for (const kind of C.POI_KINDS) {
      setLang('en'); const en = C.poiText(kind); assert.ok(en.length > 20, kind);
      setLang('tr'); const tr = C.poiText(kind); assert.notEqual(tr, en, kind + ' TR');
      setLang('ru'); const ru = C.poiText(kind); assert.notEqual(ru, en, kind + ' RU'); assert.match(ru, /[а-яё]/i);
    }
  } finally { setLang(prev); }
});

ok('module: installs on a stub game, waits for the first ticks, builds through the landing queue, updates frames, disposes clean', async () => {
  const { installOutlife10 } = await import('../../src/game/outlife10.js');
  const { Emitter } = await import('../../src/core/events.js');
  const { LandingQueue } = await import('../../src/game/landingq.js');
  const THREE = await import('three');
  const { out } = outFor('hamsi', 2468), boxes = [], removed = [];
  const mods = new Emitter(); mods.soundGens = new Map(); mods.ensureSound = () => {};
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x808890, 0.01); scene.add(out.group);
  const game = { mods, world: { outdoor: out, moonId: 'hamsi', seed: 2468 }, landQ: new LandingQueue({ startDelay: 0 }), scene, camera: new THREE.PerspectiveCamera(), player: { pos: new THREE.Vector3(30, 0, 30), indoor: false }, env: { night: 0.9 }, run: { phase: 'moon' },
    physics: { addStaticBox(...a) { boxes.push(a); return { id: boxes.length }; }, removeCollider(c) { removed.push(c); } }, audio: { at() {} }, ui: { toast() {} } };
  game.mods.on('update', (dt) => game.landQ.tick(dt));
  const api = installOutlife10(game);
  assert.ok(api);
  mods.emit('mapLoaded', game.world, game);
  assert.equal(api.stats(), null);
  for (let i = 0; i < 60; i++) mods.emit('update', 0.05, game);
  game.landQ.flush();
  for (let i = 0; i < 20; i++) mods.emit('update', 0.05, game);
  const st = api.stats();
  assert.ok(st && st.rocks > 5 && st.pois >= 3 && st.drawCalls >= 6 && st.drawCalls <= 13, JSON.stringify(st));
  assert.equal(st.colliders, boxes.length);
  assert.ok(out.group.children.some((c) => c.name === 'outlife10'));
  assert.deepEqual(warns.filter((w) => w.includes('outlife10')), [], 'module warnings');
  api.dispose();
  assert.equal(removed.length, boxes.length);
  assert.ok(!out.group.children.some((c) => c.name === 'outlife10'));
});

await Promise.all(pending);
console.log(`\n${pass} passed, ${fail} failed`);
