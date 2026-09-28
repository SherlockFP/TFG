// Node test for the pure HQ FORGE rules (no browser):  node tools/harness/forge_rules.test.mjs
import * as F from '../../src/game/enhance.js';
import { RNG } from '../../src/core/rng.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ---- success table, costs, bonuses (design section 12.1)
const table = [[1, 1, 20, 'shard_scrap', 2, 0.06], [2, 1, 35, 'shard_scrap', 3, 0.12], [3, 0.95, 55, 'shard_circuit', 2, 0.18], [4, 0.85, 80, 'shard_circuit', 3, 0.24],
  [5, 0.70, 120, 'shard_crystal', 2, 0.31], [6, 0.55, 170, 'shard_crystal', 3, 0.38], [7, 0.40, 240, 'shard_ecto', 2, 0.46], [8, 0.30, 330, 'shard_algo', 2, 0.55], [9, 0.20, 450, 'shard_source', 1, 0.65]];
ok(table.every(([lv, ch, cr, mat, n, b]) => { const p = F.plusInfo(lv); return near(p.chance, ch) && p.credits === cr && p.mat[0] === mat && p.mat[1] === n && near(p.bonus, b); }), 'success chance / cost / bonus table +1..+9');
ok(F.plusInfo(10) === null && F.enhanceInfo(9) === null, 'nothing above +9');
ok(near(F.plusMul(0), 1) && near(F.plusMul(5), 1.31) && near(F.plusMul(9), 1.65), 'plusMul');

// ---- resolution: forced rolls
ok(F.resolveEnhance(0, 0.99).ok && F.resolveEnhance(1, 0.999).ok, '+1 and +2 never fail');
let r = F.resolveEnhance(2, 0.96);   // +3 needs < 0.95
ok(!r.ok && r.to === 2 && !r.dropped, 'failing +3 keeps the level');
r = F.resolveEnhance(4, 0.75);       // +5 needs < 0.70
ok(!r.ok && r.to === 4 && !r.dropped, 'failing +5 keeps the level');
r = F.resolveEnhance(5, 0.9);        // attempt at +6 (55%) fails
ok(!r.ok && r.to === 4 && r.dropped, 'failing the attempt at +6 drops -1 (5 -> 4)');
r = F.resolveEnhance(8, 0.9);
ok(!r.ok && r.to === 7 && r.dropped, 'failing +9 drops -1');
r = F.resolveEnhance(5, 0.9, { backup: true });
ok(!r.ok && r.to === 5 && r.backupUsed && !r.dropped, 'Backup Drive prevents the drop and is used');
r = F.resolveEnhance(3, 0.99, { backup: true });
ok(!r.ok && !r.backupUsed, 'Backup Drive is NOT consumed when nothing would drop (+4 fail keeps the level anyway)');
r = F.resolveEnhance(5, 0.1, { backup: true });
ok(r.ok && r.to === 6 && !r.backupUsed, 'Backup Drive is not used on success');
ok(F.enhanceInfo(5, { backup: true }).protect && !F.enhanceInfo(3, { backup: true }).protect, 'protect flag only from +6');

// ---- statistics: climbing to +9 with and without protection
function climb(seed, backup) {
  const rng = new RNG(seed); let lv = 0, tries = 0;
  while (lv < 9 && tries < 5000) { tries++; lv = F.resolveEnhance(lv, rng.next(), { backup }).to; }
  return tries;
}
let a = 0, b = 0; for (let s = 1; s <= 300; s++) { a += climb(s, false); b += climb(s, true); }
ok(a / 300 > b / 300 && b / 300 > 9, `protected climbs are shorter (${(a / 300).toFixed(1)} vs ${(b / 300).toFixed(1)} attempts to +9)`);

// ---- overclocks
ok(F.overclockSlots(4) === 0 && F.overclockSlots(5) === 1 && F.overclockSlots(8) === 1 && F.overclockSlots(9) === 2, 'overclock sockets at +5 and +9');
ok(F.overclockSlots(9, { kind: 'armor' }) === 0, 'armour has no overclocks');
ok(F.enhanceInfo(4).opens === 1 && F.enhanceInfo(8).opens === 2 && F.enhanceInfo(2).opens === 0, 'enhanceInfo says when a socket opens');
ok(JSON.stringify(F.trimOverclocks(['shock', 'burn'], 8)) === '["shock"]' && F.trimOverclocks(['shock'], 4).length === 0, 'a level drop closes sockets');
const seen = new Set(); const rr = new RNG(9);
for (let i = 0; i < 200; i++) seen.add(F.rollOverclock(rr, []));
ok(seen.size === 6, 'all six overclocks can roll');
ok(!F.rollOverclock(new RNG(3), ['shock', 'burn', 'freeze', 'void', 'vamp']).includes('shock') && F.rollOverclock(new RNG(3), F.OVERCLOCK_IDS) === null, 'no duplicate overclocks');
ok(F.forgeName('Katana', 7, ['shock']) === '+7 Katana ⚡' && F.forgeName('Katana', 0, null) === 'Katana' && F.forgeName('Katana', 3, []) === '+3 Katana', 'forgeName');

// ---- ascension
ok(near(F.ascendInfo('common').chance, 0.90) && near(F.ascendInfo('uncommon').chance, 0.75) && near(F.ascendInfo('rare').chance, 0.55) && near(F.ascendInfo('epic').chance, 0.35) && near(F.ascendInfo('legendary').chance, 0.15), 'ascension odds 90/75/55/35/15');
ok(F.ascendInfo('mythic') === null, 'mythic is the top');
ok(F.ascendInfo('rare').mat[0] === 'shard_ecto' && F.ascendInfo('common').mat[0] === 'shard_circuit', 'ascension eats the TARGET tier shard');
ok(near(F.ascendInfo('epic', { sacrifice: true }).chance, 0.45), 'sacrifice adds +10%');
r = F.resolveAscend('epic', 0.4);
ok(!r.ok && r.to === 'epic', 'failed ascension never lowers the tier');
r = F.resolveAscend('epic', 0.3);
ok(r.ok && r.to === 'legendary', 'ascension success');
ok(F.WORKBENCH_MAX_TIER === 'rare', 'workbench tier-up capped at Rare');

// ---- shards / exchange
ok(F.SHARD_DEFS.length === 6 && F.SHARD_DEFS.map((s) => s.tier).join() === 'common,uncommon,rare,epic,legendary,mythic', 'six shards, one per tier');
ok(F.exchangeRule('shard_scrap').to === 'shard_circuit' && F.exchangeRule('shard_scrap').n === 5 && F.exchangeRule('shard_ecto').to === 'shard_algo', '5 -> 1 exchange');
ok(F.exchangeRule('shard_algo') === null && F.exchangeRule('shard_source') === null, 'Source Code cannot be bought, nothing converts past Legendary');

// ---- creature tiers: early-game caps (design: quota 0-1 max Uncommon, 2-3 max Rare, Mythic only sector 6+ or FUCKED)
ok(F.creatureTierCap(0, 100) === 'uncommon' && F.creatureTierCap(1, 100) === 'uncommon', 'quota 0-1 cap: uncommon');
ok(F.creatureTierCap(2, 100) === 'rare' && F.creatureTierCap(3, 0) === 'rare', 'quota 2-3 cap: rare');
ok(F.creatureTierCap(4, 0) === 'legendary' && F.creatureTierCap(5, 50) === 'legendary', 'quota 4-5 cap: legendary');
ok(F.creatureTierCap(4, 75) === 'mythic' && F.creatureTierCap(6, 0) === 'mythic', 'mythic from sector 6 or Threat FUCKED');
const rng = new RNG(1234);
const worst = { 0: 0, 2: 0, 4: 0 };
for (let i = 0; i < 20000; i++) {
  for (const q of [0, 2, 4]) worst[q] = Math.max(worst[q], ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(F.rollCreatureTier(rng, { quotaIndex: q, threat: q === 4 ? 70 : 100, moonTier: 4 })));
}
ok(worst[0] <= 1 && worst[2] <= 2 && worst[4] <= 4, `20k rolls at max threat respect the caps (quota 4 below FUCKED; max idx ${JSON.stringify(worst)})`);
const dist = {}; const r2 = new RNG(77);
for (let i = 0; i < 20000; i++) { const t = F.rollCreatureTier(r2, { quotaIndex: 8, threat: 50, moonTier: 2 }); dist[t] = (dist[t] || 0) + 1; }
console.log('      tier distribution quota 8 / threat 50 / moon tier 2 (20k):', JSON.stringify(dist));
ok(dist.common > 6000 && dist.rare > 2000 && dist.mythic > 0, 'mid-game distribution is varied but mostly weak');
ok(F.creatureTierLuck(0, 0, 1) === 0 && F.creatureTierLuck(50, 100, 4) === 0.5, 'luck is clamped 0..0.5');

// ---- multipliers, xp, affix counts, drops, item tier floor
ok([F.creatureTierMul('common'), F.creatureTierMul('uncommon'), F.creatureTierMul('rare'), F.creatureTierMul('epic'), F.creatureTierMul('legendary'), F.creatureTierMul('mythic')].join() === '1,1.25,1.6,2.1,2.8,4', 'HP / damage multipliers 1 / 1.25 / 1.6 / 2.1 / 2.8 / 4');
ok(F.creatureAffixCount('epic') === 1 && F.creatureAffixCount('legendary') === 2 && F.creatureAffixCount('mythic') === 3 && F.creatureAffixCount('rare') === 0, 'epic 1 / legendary 2 / mythic 3 affixes');
ok(F.creatureTierXp('mythic') > F.creatureTierXp('rare') && F.creatureTierXp('common') === 1, 'kill XP scales with tier');
ok(F.creatureItemMinTier('rare') === 'uncommon' && F.creatureItemMinTier('epic') === 'rare' && F.creatureItemMinTier('legendary') === 'epic' && F.creatureItemMinTier('mythic') === 'legendary' && F.creatureItemMinTier('common') === 'common', 'item drop tier floor = creature tier - 1');
const cnt = {}; const r3 = new RNG(5);
for (let i = 0; i < 20000; i++) for (const d of F.creatureShardDrops('mythic', r3)) cnt[d.id] = (cnt[d.id] || 0) + 1;
ok(near(cnt.shard_scrap / 20000, 0.40, 0.02) && near(cnt.shard_source / 20000, 0.25, 0.02) && near(cnt.shard_algo / 20000, 0.30, 0.02), 'mythic drop rates 40% scrap ... 25% Source Code');
const c2 = {}; for (let i = 0; i < 5000; i++) for (const d of F.creatureShardDrops('common', r3)) c2[d.id] = (c2[d.id] || 0) + 1;
ok(Object.keys(c2).join() === 'shard_scrap', 'common creatures only drop Scrap Shards');
ok(F.tierable({ hp: 30 }) && !F.tierable({ hp: null }) && !F.tierable({ hp: 100, boss: true }) && !F.tierable({ hp: 10, hazard: true }) && !F.tierable({ hp: 45, noSpawn: true }), 'only killable living creatures get tiers');
ok(F.BOSS_TIERS.foreman === 'legendary' && F.BOSS_TIERS.legacybot === 'mythic', 'bosses are fixed Legendary / Mythic');

// ---- ForgeRng: forced values first, logged
const fr = new F.ForgeRng(1).force(0.01, 0.99);
ok(fr.next('a') === 0.01 && fr.next('b') === 0.99 && fr.next('c') !== 0.99 && fr.log.length === 3, 'ForgeRng forced rolls + log');

if (fails) { console.error(fails + ' failed'); process.exit(1); } else console.log('all forge rule tests passed');
