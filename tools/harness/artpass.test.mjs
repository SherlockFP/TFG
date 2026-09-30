// Art pass: every placeholder model was replaced by a Kit-merged company-equipment model (src/models/artpass.js); every id in the
// store / crafting tables resolves to a real model builder (not the '?' box); everything builds without NaN, inside a triangle budget,
// tools point along -Z with a tip anchor.   node tools/harness/artpass.test.mjs
import { fileURLToPath } from 'node:url';   // .pathname gives /D:/... on Windows
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {} });
globalThis.document = { createElement: () => cv(), body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, getElementById: () => null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };

const R = new URL('../../src/', import.meta.url);
const imp = (p) => import(new URL(p, R).href);
const A = await imp('models/artpass.js');
const { hasItemModel, createItemModel } = await imp('models/items.js');
const { COMPONENT_MODEL_IDS } = await imp('models/components.js');
const { FORGE_ITEM_IDS, createForgeItemModel } = await imp('models/forge.js');
const { svItemModels } = await imp('models/survival.js');
const { SHARD_DEFS } = await imp('game/enhance.js');
const { ITEMS } = await imp('game/items.js');
for (const m of ['mining', 'nvgear', 'harvest', 'feedcams2', 'crafting', 'forge', 'survival', 'deployables']) await imp(`game/${m}.js`);
const LP = await imp('game/lockpick2_core.js');
const { catalogEntries } = await imp('game/shop.js');
const { RECIPES } = await imp('game/recipes.js');
const SV = await imp('game/survival_data.js');

let fail = 0;
const ok = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } };

function stats(obj) {
  let tris = 0, nan = 0, meshes = 0;
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) nan++;
    tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
  });
  return { tris, nan, meshes };
}
const { Box3, Vector3 } = await import('three');
const bounds = (obj) => new Box3().setFromObject(obj);
const sizeOf = (obj) => bounds(obj).getSize(new Vector3());

const FIXED = A.ART_IDS;
ok('art ids cover the wave-8 placeholder list', () => {
  for (const id of ['tool_axe', 'tool_pickaxe', 'tool_pickaxe_steel', 'tool_drill', 'lp2_titanium', 'lp2_bypass', 'fc_jammer', 'nvg1', 'nvg2', 'nvcell', 'sv_sickle', 'forge_backup', 'vy_blackbox', 'vy_relic', 'vy_meteorite']) assert.ok(FIXED.includes(id), id);
  assert.equal(LP.PICK.TITANIUM, 'lp2_titanium'); assert.equal(LP.PICK.BYPASS, 'lp2_bypass');
});
ok('every art model builds: finite, merged, modest triangles, sane size', () => {
  const all = FIXED.map((id) => [id, A.createArtModel(id)]);
  all.push(['potion', A.createPotionModel('#7dd0ff')], ['kitcase', A.createKitCase()], ['relic', A.createRelicModel(0x50d8ff)]);
  for (const s of SHARD_DEFS) all.push(['shard_' + s.key, A.createShardModel(s.key, s.color)]);
  for (const [id, o] of all) {
    assert.ok(o, id);
    const s = stats(o), b = sizeOf(o);
    assert.equal(s.nan, 0, id + ' NaN');
    assert.ok(s.meshes >= 2 && s.meshes <= 14, `${id} meshes ${s.meshes}`);
    assert.ok(s.tris >= 60 && s.tris <= 1600, `${id} tris ${s.tris}`);
    const maxDim = id.startsWith('hb_') ? 2.4 : 1.6;   // big valuables (bossdress/herocontent) may stand taller than hand items
    assert.ok([b.x, b.y, b.z].every((v) => Number.isFinite(v) && v > 0.02 && v < maxDim), `${id} size ${b.x} ${b.y} ${b.z}`);
    assert.equal(o.userData.size.length, 3);
  }
});
ok('tools: origin at the grip, pointing along -Z, tip anchor in front', () => {
  for (const id of ['tool_axe', 'tool_pickaxe', 'tool_pickaxe_steel', 'tool_drill', 'lp2_titanium', 'lp2_bypass', 'fc_jammer', 'sv_sickle']) {
    const o = A.createArtModel(id), b = bounds(o);
    assert.equal(o.userData.kind, 'tool', id);
    assert.ok(b.min.z < -0.1 && b.max.z < 0.25 && b.max.z > 0, `${id} z ${b.min.z}..${b.max.z}`);
    assert.ok(o.userData.tip && o.userData.tip.position.z < -0.08, id + ' tip');
    assert.ok(b.min.x <= 0.001 && b.max.x >= -0.001, id + ' centred on the grip axis');
  }
});
ok('axe / pick / drill are distinct silhouettes (not one shared box + handle)', () => {
  const sig = (id) => { const o = A.createArtModel(id), s = stats(o), b = sizeOf(o); return [s.tris, s.meshes, b.x.toFixed(3), b.y.toFixed(3), b.z.toFixed(3)].join('/'); };
  const set = new Set(['tool_axe', 'tool_pickaxe', 'tool_pickaxe_steel', 'tool_drill'].map(sig));
  assert.equal(set.size, 4);
});
ok('forge shards + backup drive resolve through models/forge.js', () => {
  for (const id of FORGE_ITEM_IDS) { const o = createForgeItemModel(id); assert.ok(o && stats(o).nan === 0 && stats(o).tris >= 60, id); }
});
ok('survival potions + sickle resolve through svItemModels', () => {
  const ids = Object.keys(SV.ALL_ITEMS || {});
  const m = svItemModels(ids);
  for (const id of ids.filter((x) => /^sv_pt_|^sv_sickle$/.test(x))) { const o = m[id](); assert.ok(stats(o).tris >= 60 && stats(o).nan === 0, id); }
  assert.ok(ids.some((x) => x.startsWith('sv_pt_')));
});
ok('every store / crafting-table item id has a real model builder', () => {
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(fileURLToPath(new URL('.', R)));
  const src = files.map((f) => fs.readFileSync(f, 'utf8')).filter((s) => /itemModels|createItemModel/.test(s));
  const svIds = Object.keys(SV.ALL_ITEMS || {}), svM = svItemModels(svIds);
  const registered = (id) => {
    if (hasItemModel(id) || COMPONENT_MODEL_IDS.includes(id) || FORGE_ITEM_IDS.includes(id) || FIXED.includes(id) || svM[id]) return true;
    const pre = id.split('_')[0] + '_';
    return src.some((s) => s.includes(`'${id}'`) || s.includes(`"${id}"`) || s.includes(`${id}:`) || (pre.length > 2 && s.includes(`'${pre}`)));
  };
  const ids = new Set(catalogEntries().filter((e) => !e.ship).map((e) => e.id));
  for (const r of RECIPES) if (typeof r.out === 'string') ids.add(r.out);
  for (const d of LP.ITEM_DEFS) ids.add(d.id);
  const missing = [...ids].filter((id) => !registered(id));
  assert.deepEqual(missing, [], 'no model builder: ' + missing.join(', '));
  assert.ok(ids.size > 80, 'table size ' + ids.size);
  assert.ok(ITEMS.fc_jammer && ITEMS.nvcell);
});
ok('the unknown-id fallback is still the only placeholder (kind unknown)', () => {
  assert.equal(createItemModel('zz_nope').userData.kind, 'unknown');
  for (const id of ['tool_axe', 'fc_jammer', 'nvg1']) assert.notEqual(A.createArtModel(id).userData.kind, 'unknown');
});
process.exit(fail ? 1 : 0);
