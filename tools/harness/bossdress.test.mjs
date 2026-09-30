// BOSS DRESS test (wave 8 night, docs/wave8/bossdress.md): themed sector boss names + lair recipes, and the themed big-valuable tables.   node tools/harness/bossdress.test.mjs
import assert from 'node:assert/strict';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {} });
globalThis.document = { createElement: () => cv(), body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, getElementById: () => null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };

const R = new URL('../../src/', import.meta.url);
const imp = (p) => import(new URL(p, R).href);
const CORE = await imp('game/cycle_core.js');
const BD = await imp('game/bossdress_core.js');
const { TR, RU } = await imp('game/bossdress_text.js');
const HT = await imp('game/herocontent_text.js');
const H = await imp('game/herocontent_core.js');
const MOD = await imp('game/bossdress.js');
const C3 = await imp('game/cycle3_core.js');
const { ITEMS, BIG_TABLES, BIG_TABLE, bigTableFor } = await imp('game/items.js');
const A = await imp('models/artpass.js');
const THREE = await import('three');

let fail = 0;
const ok = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } };
const avg = (table) => { let s = 0, w = 0; for (const [id, wt] of table) { const v = ITEMS[id].value; s += (v[0] + v[1]) / 2 * wt; w += wt; } return s / w; };

const BASE = { metro: 'mansion', influencer: 'mansion', museum: 'mansion', greenhouse: 'hospital', prison: 'factory', tower: 'office', academy: 'office', colddata: 'serverfarm' };

ok('eight themed bosses: own name + title + intro, base id / hp / dmg / rank kept, EN + TR + RU', () => {
  assert.deepEqual([...BD.DRESS_THEMES].sort(), Object.keys(BASE).sort());
  const names = new Set();
  for (const [th, base] of Object.entries(BASE)) {
    const e = CORE.BOSS_TABLE[th], b = CORE.BOSS_TABLE[base];
    assert.ok(e.themed && e !== b, th + ' is a themed copy, not an alias');
    for (const k of ['id', 'hp', 'dmg', 'rank']) assert.equal(e[k], b[k], `${th}.${k}`);
    assert.notEqual(e.name, b.name); assert.ok(e.intro && e.intro.length > 12);
    names.add(e.name);
    for (const k of [e.name, e.title, e.intro]) assert.ok(TR[k] && RU[k] && TR[k] !== k && RU[k] !== k, `${th}: translated "${k}"`);
    assert.equal(CORE.bossFor(th, 0).name, e.name); assert.equal(CORE.bossFor(th, 0).id, b.id);
  }
  assert.equal(names.size, 8, 'eight distinct names');
  assert.equal(CORE.BOSS_TABLE.metro.name, 'The Last Conductor'); assert.equal(CORE.BOSS_TABLE.greenhouse.name, 'The Pruner'); assert.equal(CORE.BOSS_TABLE.prison.name, 'The Warden');
});
ok('trophy / roster names stay the base boss names; the Legacy Bot is never dressed', () => {
  assert.equal(C3.BOSS_NAMES.host, 'The Host'); assert.equal(C3.BOSS_NAMES.foreman, 'The Foreman'); assert.equal(C3.BOSS_NAMES.middlemanager, 'Middle Manager'); assert.equal(C3.BOSS_NAMES.surgeon, 'The Head Surgeon');
  assert.equal(BD.dressOf('metro', 'legacybot', CORE.BOSS_TABLE), null);
  assert.equal(BD.dressOf('metro', 'host', CORE.BOSS_TABLE).name, 'The Last Conductor');
  assert.equal(BD.dressOf('metro', 'foreman', CORE.BOSS_TABLE), null);
});
ok('module API: infoOf answers only for the boss of the current theme; every lair recipe builds finite meshes with one accent colour', () => {
  const game = { mods: { on: () => () => {} }, world: { facility: { layout: { theme: 'prison' } } } };
  const api = MOD.installBossdress(game);
  assert.equal(game.bossDress, api);
  assert.equal(api.infoOf('foreman').name, 'The Warden'); assert.equal(api.infoOf('host'), null);
  game.world.facility.layout.theme = 'metro';
  assert.equal(api.nameOf('host'), 'The Last Conductor');
  for (const th of BD.DRESS_THEMES) {
    const recipe = MOD.RECIPES[BD.DRESS[th].props]; assert.ok(recipe, th);
    const g = new THREE.Group(), acc = new THREE.MeshBasicMaterial({ color: BD.DRESS[th].accent });
    recipe(g, acc);
    let meshes = 0, nan = 0, accent = 0;
    g.traverse((m) => { if (!m.isMesh) return; meshes++; if (m.material === acc) accent++; for (const v of m.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; });
    const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    assert.ok(meshes >= 6 && meshes <= 30 && nan === 0 && accent >= 1, `${th} meshes ${meshes} accent ${accent}`);
    assert.ok(s.x < 4 && s.z < 3 && s.y < 3.2, `${th} size ${s.x} ${s.y} ${s.z}`);
  }
  api.dispose();
});
ok('eight big valuables: sane defs (kind big, hands 0, value scale of vase..statue), EN + TR + RU, finite models on the floor', () => {
  assert.equal(H.BIG_DEFS.length, 8);
  for (const d of H.BIG_DEFS) {
    const it = ITEMS[d.id]; assert.ok(it && it.kind === 'big' && it.hands === 0 && it.mass > 10 && it.mass <= 60 && it.value[0] >= 90 && it.value[1] <= 350, d.id);
    for (const k of [d.name, d.tip]) assert.ok(HT.TR[k] && HT.RU[k] && HT.RU[k] !== k, `${d.id}: translated "${k.slice(0, 20)}"`);
    const o = A.createArtModel(d.id); assert.ok(o, d.id);
    let tris = 0, nan = 0; o.updateMatrixWorld(true);
    o.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (const v of p.array) if (!Number.isFinite(v)) nan++; tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3; });
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    assert.ok(nan === 0 && tris >= 60 && tris <= 2500, `${d.id} tris ${tris}`); assert.ok(s.y >= 0.6 && s.y <= 1.8 && s.x <= 1.3 && s.z <= 1.3, `${d.id} size ${s.x} ${s.y} ${s.z}`); assert.ok(b.min.y > -0.02 && b.min.y < 0.05, `${d.id} base y ${b.min.y}`);
  }
});
ok('big tables: the four labyrinth themes + the four boss-alias themes have their own table; 2-4 themed bigs among the entries; mean within +-15 % of the default mix (quota count stays ~7)', () => {
  const def = avg(BIG_TABLE);
  for (const th of H.BIG_THEMES) {
    const t = bigTableFor(th); assert.notEqual(t, BIG_TABLE, th); assert.equal(BIG_TABLES[th], t);
    for (const [id, w] of t) { assert.ok(ITEMS[id]?.kind === 'big' && w > 0, `${th}: ${id}`); }
    const own = new Set(t.map(([id]) => id).filter((id) => id.startsWith('hb_')));
    assert.ok(own.size >= 1 && own.size <= 2, `${th} themed bigs ${[...own]}`);
    const a = avg(t); assert.ok(a > def * 0.85 && a < def * 1.15, `${th} ${a.toFixed(0)} vs ${def.toFixed(0)}`);
  }
  for (const th of ['metro', 'greenhouse', 'prison', 'tower']) assert.ok([...new Set(bigTableFor(th).map(([id]) => id))].filter((id) => id.startsWith('hb_')).length === 2, th + ' has two themed bigs');
});

console.log(fail ? `\n${fail} FAILED` : '\nbossdress: all ok');
process.exit(fail ? 1 : 0);
