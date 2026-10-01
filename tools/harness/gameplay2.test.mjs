// Node test for the pure logic of the gameplay2 module (wave 2): node tools/harness/gameplay2.test.mjs
//   identification table coverage + classes + Turkish, fault roll counts by quota, fault picking / placement, aptitude math,
//   auto role assignment, the Spambomb numbers. No browser needed (the feature run is tools/harness/wave2_gameplay2.js).
globalThis.document = globalThis.document || { documentElement: {}, createElement: () => ({ getContext: () => null }) };
const { CREATURES } = await import('../../src/game/creatures.js');
const { registerWave1Content } = await import('../../src/game/creatures_wave1.js');
const { registerSpambomb, blastDamage, quotaAllows, outdoorInterval, FUSE_S, BLAST_R, DEF } = await import('../../src/game/creeper.js');
const { IDENT, CLASSES, CLASS_IDS, identOf, identifyDuration, stepProgress, identifyXp, starsText, gated } = await import('../../src/game/identify.js');
const F = await import('../../src/game/shipfaults.js');
const A = await import('../../src/game/aptitudes.js');
const T = await import('../../src/game/passivetree.js');
const { setLang, t } = await import('../../src/core/i18n.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL:', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ---------------------------------------------------------------- identification table
registerWave1Content();
registerSpambomb();
const ids = Object.keys(CREATURES);
ok(ids.length >= 36, 'registered creatures: ' + ids.length);
for (const id of ids) ok(!!IDENT[id], 'IDENT covers registered creature ' + id);
for (const extra of ['foreman', 'legacybot', 'skeleton', 'robot', 'spambomb']) ok(!!IDENT[extra], 'IDENT covers ' + extra);
for (const [id, row] of Object.entries(IDENT)) {
  ok(CLASS_IDS.includes(row[0]), `${id}: class ${row[0]} is known`);
  ok(row[1] >= 1 && row[1] <= 5 && Number.isInteger(row[1]), `${id}: stars 1..5`);
  ok(typeof row[2] === 'string' && row[2].length > 12, `${id}: weakness hint`);
}
ok(CLASS_IDS.length === 11 && ['Predator', 'Scavenger', 'Mimic', 'Territorial', 'Parasite', 'Stalker', 'Janitor', 'Collector', 'Anomaly', 'Swarm', 'Explosive'].every((c) => CLASSES[c]), 'all 11 classes');
ok(IDENT.spambomb[0] === 'Explosive' && identOf('spambomb').cls === 'Explosive', 'Spambomb is Explosive');
ok(IDENT.jester[0] === 'Anomaly' && IDENT.doppel[0] === 'Mimic' && IDENT.collector[0] === 'Collector' && IDENT.janitor[0] === 'Janitor' && IDENT.zombot[0] === 'Swarm', 'class spot checks');
// fallbacks for ids nobody has heard of
const unk = identOf('totally_new', { name: 'X', hp: null, dmg: 10, power: 2 });
ok(unk.cls === 'Anomaly' && unk.stars >= 1 && !unk.listed, 'fallback: unkillable -> Anomaly');
ok(identOf('nope').cls === 'Anomaly' && identOf('nope').weak.length > 5, 'fallback: no def at all');
ok(identOf('x1', { name: 'B', hp: 500, dmg: 60, power: 3, boss: true }).cls === 'Territorial' && identOf('x1', { name: 'B', hp: 500, dmg: 60, power: 3, boss: true }).stars === 5, 'fallback: boss');
ok(identOf('x2', { name: 'H', hp: null, hazard: true, power: 0 }).cls === 'Anomaly', 'fallback: hazard');
ok(identOf('x3', { name: 'S', hp: 10, dmg: 3, power: 0.4 }).cls === 'Swarm', 'fallback: cheap = swarm');
ok(identOf('x4', { name: 'P', hp: 200, dmg: 40, power: 2 }).cls === 'Predator', 'fallback: default predator');
// turkish
setLang('tr');
let missing = 0;
for (const row of Object.values(IDENT)) if (t(row[2]) === row[2]) missing++;
ok(missing === 0, 'every weakness hint has a Turkish translation (missing ' + missing + ')');
ok(t('ENTITY IDENTIFIED') !== 'ENTITY IDENTIFIED' && t('Explosive') === 'Patlayıcı', 'ui + class translations');
setLang('en');
// identify math
ok(near(identifyDuration(0), 1.5) && near(identifyDuration(0.5), 1), 'identify duration 1.5 s, Scout-ish +50% = 1 s');
let p = 0; for (let i = 0; i < 100; i++) p = stepProgress(p, 0.015, true, 1.5);
ok(near(p, 1, 1e-3), 'progress fills in 1.5 s (' + p + ')');
ok(stepProgress(0.5, 0.1, false, 1.5) < 0.5 && stepProgress(0.01, 1, false, 1.5) === 0, 'progress drains when you look away');
ok(identifyXp(1) === 25 && identifyXp(5) === 65 && starsText(3) === '★★★☆☆', 'xp + stars');
ok(gated({ type: 'crawler', def: {} }) && !gated({ type: 'mimic', def: {} }) && !gated({ type: 'turret', def: { hazard: true } }), 'gated(): hazards and mimics keep their labels');

// ---------------------------------------------------------------- spambomb
ok(near(FUSE_S, 1.5) && BLAST_R > 3 && DEF.hp > 0 && DEF.hp < 60, 'spambomb numbers: 1.5 s fuse, killable');
ok(blastDamage(1) === 34 && blastDamage(5) > blastDamage(1), 'blast damage scales with level');
ok(!quotaAllows(0) && quotaAllows(1) && quotaAllows(6), 'no spambombs in quota 0');
ok(CREATURES.spambomb.noSpawn === true, 'generic spawn gate closed without a running game');
ok(CREATURES.spambomb.custom && typeof CREATURES.spambomb.behavior === 'function', 'registered with a behaviour');
ok(outdoorInterval(0, 1) >= 40 && outdoorInterval(1, 2) < outdoorInterval(1, 1), 'outdoor timer shortens with the balance spawn multiplier');

// ---------------------------------------------------------------- faults
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
ok(F.rollFaultCount(0, 0, 0, () => 0.99) === 1 && F.rollFaultCount(0, 0, 0, () => 0) === 1, 'quota 0: exactly 1 fault');
ok(F.rollFaultCount(0, 80, 0, () => 0) === 2 && F.rollFaultCount(0, 0, 0.6, () => 0) === 2, 'quota 0: threat / hull damage adds one');
ok(F.rollFaultCount(1, 0, 0, () => 0.9) === 1 && F.rollFaultCount(1, 0, 0, () => 0.1) === 2 && F.rollFaultCount(2, 0, 0, () => 0.1) === 2, 'quota 1-2: 1..2');
ok(F.rollFaultCount(4, 0, 0, () => 0.99) === 2 && F.rollFaultCount(4, 0, 0, () => 0.1) === 3, 'quota 3+: 2..3');
ok(F.rollFaultCount(1, 65, 0, () => 0.1) === 3 && F.rollFaultCount(1, 65, 0, () => 0.9) === 2 && F.rollFaultCount(9, 99, 1, () => 0.99) === 3, 'always capped at 3');
let lo = 9, hi = 0;
for (let q = 0; q < 10; q++) for (const th of [0, 50, 100]) for (const h of [0, 0.5, 1]) for (const r of [0, 0.5, 0.99]) { const n = F.rollFaultCount(q, th, h, () => r); lo = Math.min(lo, n); hi = Math.max(hi, n); }
ok(lo === 1 && hi === 3, 'range 1..3 over all inputs');
const avg = (q) => { let s = 0; for (let i = 0; i < 100; i++) s += F.rollFaultCount(q, 0, 0, () => i / 100); return s / 100; };
ok(avg(0) < avg(1) && avg(1) < avg(5), 'fewer faults early: ' + [avg(0), avg(1), avg(5)].map((x) => x.toFixed(2)).join(' < '));
for (let i = 0; i < 50; i++) {
  const pk = F.pickFaults(3, 0, () => (i % 10) / 10);
  ok(pk.length === 3 && new Set(pk).size === 3 && pk.every((x) => F.FAULTS[x].easy), 'quota 0 picks only easy, unique faults');
}
ok(F.pickFaults(3, 3, seq([0.1, 0.9, 0.5])).length === 3 && F.pickFaults(9, 3, () => 0.3).length === 6, 'pickFaults respects the pool size');
ok(Object.keys(F.FAULTS).length === 6 && ['fuel', 'nav', 'coolant', 'hull', 'relay', 'jam'].every((k) => F.FAULTS[k]), '6 fault types');
ok(F.deadlineSeconds('midnight', 0) === 45 && F.deadlineSeconds('lever', 0) === null && F.deadlineSeconds('lever', 2) === 75, 'deadlines: midnight 45 s, lever only under pressure');
ok(F.penaltyKind(true, () => 0.1) === 'scrap' && F.penaltyKind(true, () => 0.9) === 'damage' && F.penaltyKind(false, () => 0) === 'damage', 'penalties');
ok(/^\d{5}$/.test(F.makeCode(() => 0)) && /^\d{5}$/.test(F.makeCode(() => 0.999999)), '5 digit codes');
ok(near(F.holdSeconds(8, 0.4), 8 / 1.4) && F.holdSeconds(8, 0) === 8, 'Engineer welds 40% faster');
// placement: a free spot avoids props; a blocked preferred spot moves on
const blocker = (spot) => F.panelBox(spot, 0.3);
for (const kind of Object.keys(F.PREFS)) {
  const a = F.findFreeSpot(kind, [F.WINDOW_BOX]);
  ok(a.free, kind + ': free spot on an empty ship');
  const b = F.findFreeSpot(kind, [F.WINDOW_BOX, blocker(a)]);
  ok(b.free && !F.boxesHit(F.panelBox(b), blocker(a)), kind + ': moves off a blocked spot');
  ok(Math.abs(a.x) <= 7.001 && Math.abs(a.z) <= 3.501 && a.y > 0.4 && a.y < 2.4, kind + ': inside the cabin');
}
const nav = F.findFreeSpot('nav', [F.WINDOW_BOX]);
const navd = F.findFreeSpot('navd', [F.WINDOW_BOX, F.panelBox(nav)], { pose: nav, d: 3.4 });
ok(Math.hypot(nav.x - navd.x, nav.z - navd.z) >= 3.4, 'nav console and nav display are apart');
ok(F.findFreeSpot('fuel', [F.WINDOW_BOX, ...['+x', '-x', '+z', '-z'].map((w) => ({ min: [-8, 0, -4], max: [8, 3.4, 4] }))]).free === false, 'no room -> flagged fallback, never throws');

// ---------------------------------------------------------------- aptitudes
ok(T.ROLES.trader && T.ROLES.engineer && T.ROLES.scout, 'roles registered at import');
ok(near(T.ROLES.trader.bonus.sellValue, 0.15) && near(T.ROLES.trader.bonus.shopDiscount, 0.10), 'Trader: +15% sell, -10% store');
ok(near(T.ROLES.engineer.bonus.craftLuck, 0.10) && near(T.ROLES.engineer.bonus.forgeLuck, 0.10) && near(T.ROLES.engineer.bonus.repairSpeed, 0.40), 'Engineer: +10% craft/forge, +40% repair');
ok(near(T.ROLES.technician.bonus.repairSpeed, 0.25) && near(T.ROLES.scout.bonus.identifySpeed, 0.4), 'Technician repairs, Scout identifies');
for (const id of A.allRoleIds()) ok(typeof T.ROLES[id].aptitude === 'string' && T.ROLES[id].aptitude.length > 10 && T.ROLES[id].aptitudeTr, id + ': aptitude text (en + tr)');
ok(A.allRoleIds().length === 8, '8 roles');
for (const k of ['sellValue', 'shopDiscount', 'forgeLuck', 'repairSpeed', 'identifySpeed']) ok(T.KEYS[k] && T.KEY_IDS.includes(k), 'bonus key ' + k);
ok(T.START_ID('trader') === 'start_hauler' && T.START_ID('engineer') === 'start_technician' && T.START_ID('scout') === 'start_scout', 'new roles share a tree post');
const tb = T.treeBonus({ role: 'trader', nodes: [] });
ok(near(tb.sellValue, 0.15) && near(tb.shopDiscount, 0.1) && tb.repairSpeed === 0, 'treeBonus reads the new roles / keys');
ok(T.planAllocation({ role: 'engineer', nodes: [] }, 'technician_s1').ok, 'a Trader/Engineer can allocate from the shared post');
const sw = T.planRoleSwitch({ role: 'hauler', nodes: ['hauler_s1', 'hauler_s2'] }, 'trader');
ok(sw.orphans.length === 0 && sw.clout === 0, 'Hauler -> Trader keeps the whole tree');
ok(T.pruneState({ role: 'trader', nodes: ['hauler_s1', 'scout_s1'] }).length === 1, 'pruneState works with a home post');
ok(near(A.sellMul(0.15), 1.15) && A.sellMul(0) === 1 && A.sellMul(9) === 2, 'sellMul');
ok(A.discountedPrice(100, 0.1) === 90 && A.discountedPrice(1, 0.1) === 1 && A.discountedPrice(45, 0) === 45, 'discountedPrice');
ok(near(A.repairMul(0.4), 1.4) && near(A.repairTime(8, 0.4), 8 / 1.4) && A.repairMul(-1) === 1, 'repair math');
const all = A.allRoleIds();
let plan = A.assignRoles({}, ['a', 'b', 'c', 'd'], () => 0.5);
ok(new Set(Object.values(plan)).size === 4, 'four players get four different roles');
plan = A.assignRoles({ a: 'scout', b: 'medic' }, ['c', 'd'], Math.random);
ok(!['scout', 'medic'].includes(plan.c) && !['scout', 'medic'].includes(plan.d) && plan.c !== plan.d, 'distinct from crewmates who already have roles');
for (let i = 0; i < 40; i++) { const pl = A.assignRoles({}, ['1', '2', '3', '4', '5', '6', '7', '8'], Math.random); ok(new Set(Object.values(pl)).size === 8, 'eight players cover all eight roles'); }
plan = A.assignRoles({}, Array.from({ length: 10 }, (_, i) => 'p' + i), Math.random);
const cnt = {}; for (const r of Object.values(plan)) cnt[r] = (cnt[r] || 0) + 1;
ok(Object.values(cnt).every((n) => n <= 2) && Object.keys(cnt).length === 8, 'ten players: all roles used, at most twice');
ok(A.pickRerollRole('scout', ['medic', 'hauler', null], () => 0) !== 'scout' && !['medic', 'hauler'].includes(A.pickRerollRole('scout', ['medic', 'hauler'], () => 0.9)), 'reroll: new role, not held by the crew');
ok(A.pickRerollRole('scout', all.filter((r) => r !== 'scout'), () => 0) !== 'scout', 'reroll falls back when every role is held');

// Actual registered isolated-mode actors cannot enter permanent identification through any native path.
const {installIdentify}=await import('../../src/game/identify.js'),{registerDeadletter24Actors,DL24_TYPES}=await import('../../src/game/deadletter24_combat.js'),{Emitter}=await import('../../src/core/events.js'),THREE=await import('three');
const nativeMsgs=[],nativeRequests=[];let nativeXp=0,nativeSaves=0;
const identGame={selfId:'self',profile:{bestiary:{}},mods:new Emitter(),creatures:{host:new Map(),views:new Map()},aiPlayerById:()=>({pos:new THREE.Vector3()}),net:{broadcast:(...m)=>nativeMsgs.push(m),request:(...m)=>nativeRequests.push(m)},progress:{addXp:n=>nativeXp+=n,save:()=>nativeSaves++}};
const undoActors=registerDeadletter24Actors(identGame),nativeIdent=installIdentify(identGame),profileBefore=JSON.stringify(identGame.profile);
for(const type of DL24_TYPES){const actor={id:type,type,def:CREATURES[type],pos:new THREE.Vector3(),dead:false};identGame.creatures.host.set(type,actor);ok(!gated(actor),'mode actor has no misleading scan label '+type);ok(nativeIdent.request(actor,'photo')===false,'native photo request rejects permanent mode identify');nativeIdent.hostIdent({ty:type,cid:type,via:'photo'},'self');ok(nativeIdent.mark(type,'self',true)===false,'direct native mark rejects mode actor');nativeIdent.onMsg({k:'ident',ty:type,by:'self'});nativeIdent.onMsg({k:'known',list:[type]});}
ok(nativeMsgs.length===0&&nativeRequests.length===0,'forged/direct photo produces no identify network side effects');ok(JSON.stringify(identGame.profile)===profileBefore&&nativeXp===0&&nativeSaves===0,'delayed native identify packets cannot persist mode bestiary or XP');
ok(nativeIdent.mark('hound','self',true)===true&&nativeXp>0&&identGame.profile.bestiary.hound.id,'ordinary campaign identification remains functional');nativeIdent.dispose();undoActors();

console.log(`gameplay2 test: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
