// UNIFY wave 5: two currencies (Credits crew + Clout personal), everything else is a material. node tools/harness/wallet.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../../src/game/wallet.js';
import * as H from '../../src/game/homeworld_core.js';
import { COMPONENTS } from '../../src/game/components.js';
import { ITEMS } from '../../src/game/items.js';
import { SHARD_IDS } from '../../src/game/enhance.js';

let n = 0, fails = 0;
const ok = (name, fn) => { n++; try { fn(); } catch (e) { fails++; console.log('FAIL', name, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); } };
const read = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');

ok('exactly two currencies', () => { assert.deepEqual(W.CURRENCY_IDS, ['credits', 'clout']); assert.equal(W.CURRENCIES.credits.scope, 'crew'); assert.equal(W.CURRENCIES.clout.scope, 'personal'); });
ok('every homeworld store key is classified: cr = credits, clout = clout, the rest are materials', () => {
  for (const k of H.RES_KEYS) { const c = W.classify(k); assert.ok(['credits', 'clout', 'material'].includes(c), k); }
  assert.equal(W.classify('cr'), 'credits'); assert.equal(W.classify('clout'), 'clout');
  for (const k of ['parts', 'meals', 's1', 's2', 's3', 's4']) assert.equal(W.classify(k), 'material', k);
  assert.deepEqual(H.RES_KEYS.filter((k) => W.classify(k) !== 'material'), ['cr', 'clout']);
});
ok('components and forge shards are materials (never a price)', () => {
  for (const id of Object.keys(COMPONENTS)) assert.equal(W.classify(id), 'material', id);
  const shards = SHARD_IDS;
  assert.ok(shards.length >= 6); for (const id of shards) assert.equal(W.classify(id), 'material', id);
  assert.equal(W.materialKind('comp_wood'), 'components'); assert.equal(W.materialKind('shard_ecto'), 'shards'); assert.equal(W.materialKind('s2'), 'shards'); assert.equal(W.materialKind('parts'), 'stash'); assert.equal(W.materialKind('pizza'), null);
  for (const k of ['xp', 'seasonXp', 'level']) assert.equal(W.classify(k), 'progress');
  assert.equal(W.classify('credits'), 'credits'); assert.equal(W.classify('coins'), 'clout'); assert.equal(W.classify('bogus'), null);
});
ok('the shop only ever prices things in credits or clout', () => {
  const src = read('game/shop.js');
  const cur = new Set([...src.matchAll(/currency: ([^,]+),/g)].map((m) => m[1].trim()));
  for (const c of cur) assert.ok(/^(coin \? 'clout' : 'credits'|'credits')$/.test(c), 'unexpected currency expression: ' + c);
});
ok('wallet row: one format, floors, never negative, safe on partial games', () => {
  assert.equal(W.walletRow(60, 12), '▮ 60 · ◈ 12'); assert.equal(W.walletRow(12.9, -4), '▮ 12 · ◈ 0'); assert.equal(W.walletRow(undefined, null), '▮ 0 · ◈ 0');
  assert.deepEqual(W.walletOf({ run: { credits: 77 }, profile: { coins: 5 } }), { credits: 77, clout: 5 });
  assert.deepEqual(W.walletOf({}), { credits: 0, clout: 0 }); assert.deepEqual(W.walletOf(null), { credits: 0, clout: 0 });
  assert.equal(W.walletRowOf({ run: { credits: 9 }, progress: { p: { coins: 3 } } }), '▮ 9 · ◈ 3');
});
ok('materials row + counting (inventory item types + homeworld store)', () => {
  const c = W.countMaterials(['comp_wood', 'comp_wood', 'shard_scrap', 'flashlight', 'comp_cable'], { parts: 14, meals: 2, s1: 3, s2: 1 });
  assert.deepEqual(c, { components: 3, shards: 5, stash: 14, meals: 2 });
  assert.equal(W.materialsRow(c), 'Materials: Components 3 · Shards 5 · Stash 14 · Meals 2');
  assert.equal(W.materialsRow({ components: 0 }), ''); assert.equal(W.materialsRow(null), '');
});
ok('the HUD shows the wallet row, the homeworld panel shows it + tags materials', () => {
  const hud = read('ui/hud.js'), hw = read('ui/panels/homeworld.js');
  assert.ok(/walletRow\(this\.creditsVal/.test(hud) && /run\.credits \?\? 0\) !== this\.creditsVal/.test(hud));
  assert.ok(/walletRowOf\(game\)/.test(hw) && /classify\(k\) === 'material'/.test(hw));
});

console.log(`wallet: ${n} groups, ${fails} failed`);
if (fails) process.exit(1);
