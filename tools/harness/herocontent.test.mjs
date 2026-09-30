// HERO CONTENT test (wave 8, docs/wave8/herocontent.md): themed scrap tables for metro / greenhouse / prison / tower, their twelve new items
// (defs, EN/TR/RU, models), the theme -> boss mapping, and the route board payout reading the new tables.   node tools/harness/herocontent.test.mjs
import assert from 'node:assert/strict';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {} });
globalThis.document = { createElement: () => cv(), body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, getElementById: () => null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };

const R = new URL('../../src/', import.meta.url);
const imp = (p) => import(new URL(p, R).href);
const H = await imp('game/herocontent_core.js');
const { ITEMS, SCRAP_TABLE, scrapTableFor } = await imp('game/items.js');
const CORE = await imp('game/cycle_core.js');
const RB = await imp('game/routeboard_core.js');
const { MOONS } = await imp('game/moons.js');
const { TR, RU } = await imp('game/herocontent_text.js');
const A = await imp('models/artpass.js');
const { Box3, Vector3 } = await import('three');

let fail = 0;
const ok = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } };
const avg = (table) => { let s = 0, w = 0; for (const [id, wt] of table) { const v = ITEMS[id]?.value; if (!v || id === 'key') continue; s += (v[0] + v[1]) / 2 * wt; w += wt; } return s / w; };

ok('four themes have their own table (not the factory fallback), 8-10 signature entries each, every id is a real item', () => {
  assert.deepEqual([...H.HERO_THEMES].sort(), ['greenhouse', 'metro', 'prison', 'tower']);
  for (const th of H.HERO_THEMES) {
    assert.notEqual(scrapTableFor(th), SCRAP_TABLE.factory, th);
    assert.ok(H.SIGNATURE[th].length >= 8 && H.SIGNATURE[th].length <= 10, `${th} signature ${H.SIGNATURE[th].length}`);
    for (const [id, w] of scrapTableFor(th)) { assert.ok(ITEMS[id], `${th}: ${id} exists`); assert.ok(w > 0); }
    assert.ok(H.SIGNATURE[th].some(([id]) => id.startsWith('hc_')), th + ' owns new items');
  }
});
ok('twelve new items: sane defs, EN + TR + RU name and tip', () => {
  assert.equal(H.ITEM_DEFS.length, 12);
  for (const d of H.ITEM_DEFS) {
    const it = ITEMS[d.id];
    assert.ok(it && it.kind === 'scrap' && it.value[0] > 0 && it.value[1] > it.value[0] && it.value[1] <= 150, d.id);
    assert.ok(H.SIGNATURE[d.sig].some(([id]) => id === d.id), d.id + ' is in its theme table');
    for (const k of [d.name, d.tip]) assert.ok(TR[k] && RU[k] && RU[k] !== k, `${d.id}: translated "${k.slice(0, 24)}"`);
  }
});
ok('economy: every table averages within -10 % / +20 % of the factory mix (median quota count stays ~7)', () => {
  const f = avg(SCRAP_TABLE.factory);
  for (const th of H.HERO_THEMES) { const a = avg(scrapTableFor(th)); assert.ok(a > f * 0.9 && a < f * 1.2, `${th} ${a.toFixed(1)} vs factory ${f.toFixed(1)}`); }
});
ok('every new item has an art-pass model: finite, merged, modest triangles, sane size, base on the floor', () => {
  for (const id of H.ITEM_IDS) {
    const o = A.createArtModel(id); assert.ok(o, id);
    let tris = 0, nan = 0, meshes = 0; o.updateMatrixWorld(true);
    o.traverse((m) => { if (!m.isMesh) return; meshes++; const p = m.geometry.attributes.position; for (const v of p.array) if (!Number.isFinite(v)) nan++; tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3; });
    const b = new Box3().setFromObject(o), s = b.getSize(new Vector3());
    assert.equal(nan, 0, id + ' NaN'); assert.ok(meshes >= 2 && meshes <= 14, `${id} meshes ${meshes}`); assert.ok(tris >= 60 && tris <= 1600, `${id} tris ${tris}`);
    assert.ok(Math.max(s.x, s.y, s.z) > 0.08 && [s.x, s.y, s.z].every((v) => v > 0.005 && v < 1.2), `${id} size ${s.x} ${s.y} ${s.z}`); assert.ok(b.min.y > -0.02 && b.min.y < 0.05, `${id} base y ${b.min.y}`);
  }
});
ok('themed cycle bosses: every new theme maps to an existing boss (same stats, id, trophy), not the Foreman fallback by accident', () => {
  const ids = new Set(Object.values(CORE.BOSS_TABLE).map((b) => b.id));
  const want = { metro: 'host', greenhouse: 'surgeon', prison: 'foreman', tower: 'middlemanager', influencer: 'host', academy: 'middlemanager', museum: 'host', colddata: 'loadbalancer' };
  for (const [th, id] of Object.entries(want)) { assert.equal(CORE.bossFor(th, 0).id, id, th); assert.equal(CORE.bossFor(th, 0).theme, th); assert.ok(ids.has(id)); }
  assert.equal(new Set(['metro', 'greenhouse', 'prison', 'tower'].map((th) => CORE.bossFor(th, 0).id)).size, 4, 'the four labyrinth themes get four different bosses');
  assert.equal(CORE.bossFor('nonsense', 0).id, 'foreman');
  assert.equal(CORE.bossFor('metro', 4).id, 'legacybot');
});
ok('route board payout for the hero moons reads the new table, not the factory average', () => {
  const valueOf = (id) => ITEMS[id]?.value;
  for (const id of ['levrek', 'lufer', 'cipura']) {
    const m = MOONS[id], th = m.interior;
    assert.ok(H.HERO_THEMES.includes(th), id + ' is a labyrinth moon');
    const mine = RB.payout(m, 0, RB.tableAvg(scrapTableFor(th), valueOf)), old = RB.payout(m, 0, RB.tableAvg(SCRAP_TABLE.factory, valueOf));
    assert.ok(mine[0] > 0 && mine[1] > mine[0]);
    assert.notDeepEqual(mine, old, id + ' payout differs from the factory fallback');
  }
});

console.log(fail ? `\n${fail} FAILED` : '\nherocontent: all ok');
process.exit(fail ? 1 : 0);
