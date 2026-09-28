// Node test for the pure ITEM DURABILITY rules (no browser):  node tools/harness/durability.test.mjs
import * as D from '../../src/game/durability_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };

// item defs mirroring the real registry (id, kind, class fields, tier)
const DEF = {
  pipe: { id: 'pipe', kind: 'weapon', dmg: 14, rarity: 'common' },
  bat: { id: 'bat', kind: 'weapon', dmg: 22, rarity: 'common', tier: 'common' },
  crowbar: { id: 'crowbar', kind: 'weapon', dmg: 18, rarity: 'uncommon', tier: 'uncommon' },
  machete: { id: 'machete', kind: 'weapon', dmg: 26, rarity: 'rare' },
  katana: { id: 'katana', kind: 'weapon', dmg: 30, rarity: 'epic', tier: 'epic' },
  sledge: { id: 'sledge', kind: 'weapon', dmg: 48, hands: 2, rarity: 'rare' },
  pistol: { id: 'pistol', kind: 'weapon', dmg: 17, ranged: true, wfire: 'hitscan', rarity: 'rare', tier: 'rare' },
  smg: { id: 'smg', kind: 'weapon', dmg: 5, ranged: true, cfire: 'hitscan', rarity: 'rare', tier: 'rare' },
  shotgun: { id: 'shotgun', kind: 'weapon', dmg: 90, ranged: true, rarity: 'legendary' },
  gravtool: { id: 'gravtool', kind: 'weapon', dmg: 0, ranged: true, cfire: 'grav', tier: 'epic' },
  hoodie: { id: 'arm_hoodie', kind: 'armor', gear: { armor: 0.06 } },
  kevlar: { id: 'arm_kevlar', kind: 'armor', gear: { armor: 0.18 } },
  flash: { id: 'flashlight', kind: 'tool', battery: 100 },
  lockpick: { id: 'lockpick', kind: 'tool', charges: 3 },
  dongle: { id: 'trk_dongle', kind: 'trinket', gear: { luck: 0.06 } },
  medkit: { id: 'medkit', kind: 'consumable' },
  unk: { id: 'weirdblade', kind: 'weapon', dmg: 10 },
  unk2h: { id: 'weirdhammer', kind: 'weapon', dmg: 40, hands: 2 },
};
const mk = (def, o = {}) => ({ type: def.id, def, tier: null, affix: null, plus: 0, oc: [], dur: null, dr: 0, ...o });

// ---- classification: charge / battery / consumable / trinket items are left alone
ok(D.durKind(DEF.pipe) === 'melee' && D.durKind(DEF.pistol) === 'ranged' && D.durKind(DEF.hoodie) === 'armor', 'kinds: melee / ranged / armor');
ok(D.durKind(DEF.flash) === null && D.durKind(DEF.lockpick) === null && D.durKind(DEF.dongle) === null && D.durKind(DEF.medkit) === null && D.durKind(DEF.gravtool) === null, 'flashlight, lockpick, trinket, consumable, grav tool: not durable');
ok(D.durKind({ ...DEF.pipe, unbreakable: true }) === null, 'def.unbreakable opts out');

// ---- table: class x tier (design numbers)
const M = (def, o) => D.itemMax(mk(def, o));
ok(M(DEF.pipe) === 120, 'common pipe = 120 hits');
ok(M(DEF.pipe, { tier: 'legendary' }) === 480, 'legendary pipe = 480');
ok(M(DEF.katana, { tier: 'legendary' }) === 600, 'legendary katana = 600');
ok(M(DEF.katana) === 390, 'epic katana (its own tier) = 390');
ok(M(DEF.machete) === 234 && M(DEF.sledge) === 162, 'rare machete 234 / rare sledgehammer 162');
ok(M(DEF.pistol) === 288 && M(DEF.smg) === 450 && M(DEF.shotgun) === 400, 'guns: pistol 288, SMG 450, shotgun 400 shots');
ok([DEF.pistol, DEF.smg, DEF.shotgun].every((d) => M(d) >= 250 && M(d) <= 500), 'guns stay within 250-500 shots');
ok(M(DEF.unk) === 120 && M(DEF.unk2h) === 100, 'unknown melee falls back to 120 (one-handed) / 100 (two-handed)');
ok(M(DEF.hoodie) === 400 && M(DEF.kevlar) === 700, 'armour: hoodie 400, kevlar 700 damage points');
const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const seq = tiers.map((t) => M(DEF.pipe, { tier: t }));
ok(seq.every((v, i) => i === 0 || v > seq[i - 1]), 'higher tier = more durability: ' + seq.join(' < '));
ok(M(DEF.pipe, { tier: 'epic', affix: null }) === Math.round(120 * 2.6), 'tier multiplier');
ok(D.itemMax(mk(DEF.pipe, { affix: { rarity: 'rare' } })) === Math.round(120 * 1.8), 'affix rarity counts as the tier (tierOfItem)');
ok(M(DEF.pipe, { plus: 5 }) === Math.round(120 * 1.4) && M(DEF.pipe, { plus: 9 }) === Math.round(120 * 1.72), 'forge plus adds +8 % each');
ok(M(DEF.pipe, { dr: 1 }) === 114 && M(DEF.pipe, { dr: 3 }) === 102 && M(DEF.pipe, { dr: 20 }) === 72, 'every full repair -5 % max, floor 60 %');
ok(D.ageMul(8) === 0.6 && D.ageMul(0) === 1, 'ageMul clamps at 0.6');

// ---- untouched items are full; dur clamps to the max
ok(D.itemDur(mk(DEF.pipe)) === 120 && D.itemDur(mk(DEF.pipe, { dur: 50 })) === 50 && D.itemDur(mk(DEF.pipe, { dur: 9999 })) === 120, 'itemDur: null = full, clamped');
ok(D.itemMax(mk(DEF.flash)) === 0 && D.durInfo(mk(DEF.flash)) === null, 'non-durable item: max 0, no info');

// ---- wear amounts
ok(D.wearFor('melee', 'swing') + D.wearFor('melee', 'hit') === 1, 'a melee hit costs 1 (0.4 swing + 0.6 connect), a miss 0.4');
ok(D.wearFor('ranged', 'shot') === 1 && D.wearFor('ranged', 'hit') === 0, 'a shot costs 1');
ok(D.wearFor('armor', 'dmg', 20) === 10 && D.wearFor('armor', 'dmg', 200) === 25 && D.wearFor('armor', 'dmg', 999) === 0, 'armour wears 0.5 per damage, capped, instakills excluded');
ok(D.wearFor('melee', 'pry') === 6 && D.wearFor('armor', 'shot') === 0, 'crowbar pry costs 6');

// ---- thresholds: 25 % warn, 10 % critical, 0 broken
ok(D.stateOf(120, 120) === 'ok' && D.stateOf(31, 120) === 'ok' && D.stateOf(30, 120) === 'worn' && D.stateOf(12, 120) === 'critical' && D.stateOf(0, 120) === 'broken', 'stateOf: ok / worn (<=25%) / critical (<=10%) / broken');
let w = D.applyWear(31, 120, 1.5);
ok(w.dur === 29.5 && w.before === 'ok' && w.after === 'worn' && w.changed && !w.zero, 'applyWear crosses the 25 % threshold');
w = D.applyWear(0.6, 120, 1);
ok(w.dur === 0 && w.zero && w.after === 'broken', 'applyWear reaches 0');
ok(D.applyWear(0, 120, 5).dur === 0 && !D.applyWear(0, 120, 5).zero, 'wear cannot go below 0 and only reports the transition once');
// simulate a pipe: swing until it breaks = exactly 120 connected hits
let d = 120, hits = 0;
while (d > 0) { d = D.applyWear(d, 120, D.wearFor('melee', 'swing') + D.wearFor('melee', 'hit')).dur; hits++; }
ok(hits === 120, 'a common pipe breaks after 120 connected hits (' + hits + ')');
d = 120; let misses = 0;
while (d > 0) { d = D.applyWear(d, 120, D.wearFor('melee', 'swing')).dur; misses++; }
ok(misses === 300, 'a pipe survives 300 whiffs (misses are cheaper): ' + misses);

// ---- broken vs destroyed by tier (forge investments are never wiped)
ok(D.zeroOutcome('common') === 'destroy' && D.zeroOutcome('uncommon') === 'destroy', 'Common / Uncommon are destroyed at 0');
ok(D.zeroOutcome('rare') === 'broken' && D.zeroOutcome('epic') === 'broken' && D.zeroOutcome('legendary') === 'broken' && D.zeroOutcome('mythic') === 'broken', 'Rare+ become BROKEN');
ok(D.zeroOutcome('common', 3) === 'broken' && D.zeroOutcome('uncommon', 0, 1) === 'broken', 'a forged (+N / overclock) common item is BROKEN, not destroyed');
ok(D.durInfo(mk(DEF.pipe)).outcome === 'destroy' && D.durInfo(mk(DEF.machete)).outcome === 'broken' && D.durInfo(mk(DEF.pipe, { plus: 2 })).outcome === 'broken', 'durInfo.outcome');
ok(D.isBroken(mk(DEF.machete, { dur: 0 })) && !D.isBroken(mk(DEF.machete, { dur: 1 })) && !D.isBroken(mk(DEF.machete)), 'isBroken');
ok(D.brokenValue(100) === 30 && D.repairedValue(30) === 100, 'broken sell value x0.3 and back');

// ---- host broadcast throttle: only on 10 % buckets / thresholds
ok(!D.shouldBroadcast(100, 99, 120) && D.shouldBroadcast(100, 90, 120), 'broadcast only when the 10 % bucket changes');
ok(D.shouldBroadcast(31, 29.5, 120) && D.shouldBroadcast(1, 0, 120), 'broadcast on threshold crossings and at 0');
let sent = 0; d = 120;
for (let i = 0; i < 120; i++) { const n = D.applyWear(d, 120, 1).dur; if (D.shouldBroadcast(d, n, 120)) sent++; d = n; }
ok(sent <= 14, 'a whole pipe life costs at most 14 state broadcasts (' + sent + ')');

// ---- repair math
let it = mk(DEF.pipe, { dur: 30 });                       // 25 % left -> missing 90/120 = 75 %
let p = D.repairPlan(it, 'bench');
ok(p.ok && p.full && p.aged && p.newRepairs === 1 && p.newMax === 114 && p.newDur === 114, 'bench repair restores 100 % of the (aged) max: 114');
ok(p.comps.some(([id, n]) => id === 'comp_scrapmetal' && n === 4) && p.comps.some(([id]) => id === 'comp_cloth') && p.credits > 0 && p.shard === null, 'bench repair: scrap metal + cloth (melee) + a little credit, no shard for a common item');
it = mk(DEF.pipe, { dur: 100 });                          // missing 17 % -> not a "full repair": no ageing
p = D.repairPlan(it, 'bench');
ok(p.ok && !p.full && p.newRepairs === 0 && p.newMax === 120 && p.comps[0][1] === 2, 'a small repair does not age the item and is cheap');
ok(!D.repairPlan(mk(DEF.pipe), 'bench').ok && !D.repairPlan(mk(DEF.flash), 'bench').ok, 'nothing to repair on a full or non-durable item');
const gunP = D.repairPlan(mk(DEF.pistol, { dur: 100 }), 'bench');
ok(gunP.kind === 'ranged' && gunP.comps.some(([id]) => id === 'comp_circuit'), 'guns need circuits');
const armP = D.repairPlan(mk(DEF.kevlar, { dur: 100 }), 'bench');
ok(armP.kind === 'armor' && armP.comps.some(([id]) => id === 'comp_cloth'), 'armour needs cloth');
// broken Rare+ needs the extra tier shard
const bm = mk(DEF.machete, { dur: 0 });
p = D.repairPlan(bm, 'bench');
ok(p.ok && p.broken && p.shard === 'shard_crystal' && p.newDur === p.newMax && p.newRepairs === 1, 'broken Rare item: bench repair needs a Data Crystal (its tier shard)');
ok(D.repairPlan(mk(DEF.katana, { dur: 0 }), 'bench').shard === 'shard_ecto' && D.repairPlan(mk(DEF.katana, { tier: 'legendary', dur: 0 }), 'bench').shard === 'shard_algo', 'shard follows the tier (epic Ecto Core, legendary Algorithm Fragment)');
ok(D.repairPlan(mk(DEF.pipe, { dur: 0, plus: 2 }), 'bench').shard === null, 'a broken forged Common item needs no shard');
// HQ service: credits only, a bit pricier than the bench
const hq = D.repairPlan(bm, 'hq'), bench = D.repairPlan(bm, 'bench');
const benchTotal = bench.credits + bench.comps.reduce((s, [id, n]) => s + D.COMP_VALUE[id] * n, 0) + D.SHARD_VALUE[2];
ok(hq.ok && hq.comps.length === 0 && hq.shard === null && hq.credits > benchTotal, 'HQ repair: credits only and pricier than the bench (' + hq.credits + ' > ' + benchTotal + ')');
ok(D.repairPlan(mk(DEF.pipe, { dur: 30 }), 'hq').credits > D.repairPlan(mk(DEF.pipe, { dur: 30 }), 'bench').credits, 'HQ credits > bench credits');
// repeated repairs age the item down to 60 %
let r = 0; it = mk(DEF.pipe, { dur: 0 });
for (let i = 0; i < 12; i++) { const q = D.repairPlan(it, 'bench'); it = { ...it, dur: q.newDur - 50, dr: q.newRepairs }; r++; }
ok(D.itemMax(it) === 72 && it.dr === 12, 'ageing floors the max at 60 % of the original (72)');
ok(D.repairPlan(mk(DEF.pipe, { dur: 10 }), 'bench').credits < D.repairPlan(mk(DEF.pipe, { tier: 'epic', dur: 10 }), 'bench').credits, 'higher tier = pricier repair');

// ---- Repair Kit: +40 % of the max, no ageing, revives broken items
let k = D.kitRepair(mk(DEF.pipe, { dur: 30 }));
ok(k && k.dur === 78 && k.max === 120 && !k.revived, 'kit: 30 -> 78 (+48 = 40 % of 120)');
k = D.kitRepair(mk(DEF.machete, { dur: 0 }));
ok(k && k.dur === 94 && k.revived, 'kit revives a broken machete to 40 % (94/234)');
k = D.kitRepair(mk(DEF.pipe, { dur: 110 }));
ok(k && k.dur === 120, 'kit never exceeds the max');
ok(D.kitRepair(mk(DEF.pipe)) === null && D.kitRepair(mk(DEF.flash)) === null, 'kit does nothing on a full / non-durable item');
ok(D.mostWorn([mk(DEF.pipe, { dur: 60 }), mk(DEF.bat, { dur: 10 }), mk(DEF.katana), mk(DEF.flash)]).type === 'bat', 'mostWorn picks the lowest fraction');
ok(D.mostWorn([mk(DEF.pipe), mk(DEF.flash)]) === null, 'mostWorn: nothing worn');

console.log(fails ? `\n${fails} FAILED` : '\nall durability rule checks passed');
process.exit(fails ? 1 : 0);
