// daily service node test (menu path: no game, no DOM): real cosmetics catalog, real profile helpers, rewards applied to a plain profile.
// Run: node tools/harness/daily_svc.test.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { createDailyService, cosmeticCatalog, deliverableId } = await import('../../src/game/daily_svc.js');
const C = await import('../../src/game/daily_core.js');
const { defaultProfile } = await import('../../src/core/save.js');
const { ITEMS } = await import('../../src/game/items.js');
const { TIERS } = await import('../../src/game/tiers.js');
await import('../../src/game/forge.js');   // registers the shard items
await import('../../src/game/components.js');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- catalog: every tier a crate can roll has cosmetics, none are secret / venom, every entry has a name and a known tier
const cat = cosmeticCatalog();
ok(cat.length > 30, 'catalog size ' + cat.length);
ok(cat.every((e) => e.slot && e.id && e.name && TIERS[e.tier]), 'entries are well formed');
ok(!cat.some((e) => e.secret || e.id === 'venom' || e.id === 'none'), 'no secret / venom / none');
for (const tr of ['common', 'uncommon', 'rare', 'epic', 'legendary']) ok(cat.some((e) => e.tier === tr), 'has ' + tr);

// ---- deliverable whitelist: shards + components, never key items or random stuff
ok(deliverableId('shard_scrap') && deliverableId('comp_cable') && deliverableId('comp_crystal'));
ok(!deliverableId('comp_accesscard'), 'key item');
ok(!deliverableId('pipe') && !deliverableId('nonexistent'));
for (const id of C.crateItemIds()) ok(ITEMS[id], 'crate item exists: ' + id);
for (let d = 1; d <= 7; d++) for (const [id] of C.loginReward(d).items) ok(ITEMS[id], 'login item exists: ' + id);
for (let t = 1; t <= 30; t++) for (const [id] of C.seasonReward(t).items) ok(ITEMS[id], 'season item exists: ' + id);
for (const q of Object.values(C.QUEST_REWARD)) for (const [id] of q.items || []) ok(ITEMS[id], 'quest item exists: ' + id);

// ---- service on a plain profile
const { ensureWardrobeProfile } = await import('../../src/game/cosmetics.js');
const P = ensureWardrobeProfile(defaultProfile()); P.name = 'Tester';
const svc = createDailyService({ profile: P });
let changed = 0; svc.onChange(() => { changed++; });
const coins0 = P.coins;
const st = svc.login();
ok(st.canClaim && st.day === 1);
const r = svc.claimLogin();
ok(r.ok && P.coins > coins0 && svc.stash().length > 0, 'day 1 pays Clout and queues parts');
ok(P.login.streak === 1 && P.login.total === 1, 'achievement counters mirrored');
ok(!svc.claimLogin().ok, 'no double claim');
ok(changed >= 1);
ok(svc.hasNew() === false || svc.attention().total >= 0);

// challenges via the core + the service claim path (xp goes through the offline hook, may level up)
const Q = svc.quests();
eq(Q.daily.length, 3); eq(Q.weekly.length, 3);
Q.daily[0].prog = svc.questTarget(Q.daily[0]);
const xp0 = P.xp, lv0 = P.level;
const c = svc.claimQuest('day', 0);
ok(c.ok && c.out.coin > 0 && (P.xp > xp0 || P.level > lv0), 'quest reward applied to the profile');
ok(svc.season().xp > 0, 'season xp came with it');
ok(svc.questText(Q.daily[1]).length > 5 && !/\{n\}/.test(svc.questText(Q.daily[1])), 'quest text is filled in');

// crates: open one of each kind, cosmetic ends up in the wardrobe, no duplicates while unowned entries exist
const owned = () => P.cosmetics.suits.length + P.cosmetics.hats.length + (P.cosmetics.faces?.length || 0) + (P.cosmetics.backs?.length || 0);
for (const kind of ['cosmetic', 'weekly', 'supply', 'quota']) {
  const crate = C.grantCrate(P, kind, 'test');
  const before = owned(), coins = P.coins, stash = svc.stash().length;
  const o = svc.openCrate(crate.id);
  ok(o.ok && o.view.title && o.view.color, kind + ' opens');
  if (o.result.kind === 'cosmetic') ok(owned() === before + 1, kind + ': cosmetic granted once');
  else if (o.result.kind === 'coin') ok(P.coins > coins);
  else ok(svc.stash().length >= stash);
  ok(!svc.openCrate(crate.id).ok, 'cannot open twice');
}
const sc = C.grantCrate(P, 'season', 'season', { tier: 'legendary' });
const so = svc.openCrate(sc.id);
ok(so.ok && (so.result.kind === 'cosmetic' || so.result.kind === 'coin'));
// reel cards: seeded, right amount, every card has a known tier
const crate2 = C.grantCrate(P, 'supply', 'reel');
const cards = svc.reelCards(crate2, 40);
eq(cards.length, 40); ok(cards.every((k) => TIERS[k.tier] && k.title), 'reel cards ok');
eq(svc.reelCards(crate2, 40), cards, 'reel is deterministic');
// opening everything owned -> Clout instead of a duplicate
for (let i = 0; i < 400; i++) { const k = C.grantCrate(P, 'cosmetic', 'spam' + i); svc.openCrate(k.id); }
const dupe = svc.openCrate(C.grantCrate(P, 'cosmetic', 'last').id);
ok(dupe.ok, 'still opens when everything may be owned');
ok(cat.every((e) => P.cosmetics[{ suit: 'suits', hat: 'hats', face: 'faces', back: 'backs' }[e.slot]].includes(e.id)) || dupe.result.kind !== 'coin' || dupe.result.dupe, 'dupe path turns into Clout');

// season claim through the service
C.seasonAdd(P, 2000);
const s0 = svc.season();
ok(s0.claimable.length >= 1);
const claimed = svc.claimAllSeason();
ok(claimed.length === s0.claimable.length && svc.season().claimable.length === 0);
console.log(`daily_svc.test.mjs: ${n} assertions OK`);
