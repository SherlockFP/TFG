// Node validation of the passive tree data + logic (no browser).  Run: node tools/harness/wave1_tree.mjs
// Checks: connected graph, no orphan node, known bonus keys, costs, counts, geometry, allocation / refund / role-switch rules,
// save migration and derivedStats integration.  Exit code 1 on any failure.
import * as T from '../../src/game/passivetree.js';
import { createRpgController } from '../../src/game/rpgctl.js';
import { ensureRpgProfile } from '../../src/game/profile.js';
import { derivedStats, rebirthPreview, applyRebirth, metaMultipliers } from '../../src/game/progression.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${a}, want ${b})`);
const near = (a, b, msg) => ok(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, want ${b})`);

// ---------------------------------------------------------------- data
const { NODES, NODE, EDGES, ADJ, ROLES, ROLE_ORDER, KEYS } = T;
console.log(`nodes ${NODES.length}, edges ${EDGES.length}`);
ok(NODES.length >= 110 && NODES.length <= 140, `node count 110..140 (${NODES.length})`);
const by = (t) => NODES.filter((n) => n.type === t);
eq(by('start').length, 6, 'six role posts');
ok(by('notable').length >= 18, `>= 18 notables (${by('notable').length})`);
ok(by('keystone').length >= 8, `>= 8 keystones (${by('keystone').length})`);
ok(NODES.filter((n) => n.rare && n.b.bagSlots >= 1).length >= 3, '>= 3 rare bag-column nodes');
eq(ROLE_ORDER.length, 6, 'six roles');
for (const id of ROLE_ORDER) ok(ROLES[id] && NODE[T.START_ID(id)], `role ${id} has a start node`);

// ids unique, edges valid, no duplicates
eq(new Set(NODES.map((n) => n.id)).size, NODES.length, 'unique node ids');
const seenEdge = new Set();
for (const [a, b] of EDGES) {
  ok(NODE[a] && NODE[b], `edge endpoints exist ${a}-${b}`);
  const k = a < b ? a + '|' + b : b + '|' + a;
  ok(!seenEdge.has(k), `duplicate edge ${k}`); seenEdge.add(k);
  ok(a !== b, 'self edge');
  ok(ADJ[a].includes(b) && ADJ[b].includes(a), `adjacency symmetric ${a}-${b}`);
}
// no orphan + connected from EVERY role start
for (const n of NODES) ok(ADJ[n.id].length >= 1, `orphan node ${n.id}`);
for (const role of ROLE_ORDER) {
  const all = new Set(NODES.map((n) => n.id));
  const reach = T.reachableFrom(T.START_ID(role), all);
  eq(reach.size, NODES.length, `every node reachable from ${role}`);
}
// bonus keys known, values sane
const checkBonus = (b, where) => {
  for (const [k, v] of Object.entries(b)) {
    ok(KEYS[k], `${where}: unknown bonus key ${k}`);
    ok(Number.isFinite(v) && v !== 0, `${where}: bad value ${k}=${v}`);
    if (KEYS[k]?.unit === 'pct') ok(Math.abs(v) <= 1, `${where}: pct key ${k} must be a fraction (${v})`);
  }
};
for (const n of NODES) { checkBonus(n.b, n.id); ok(n.name && typeof n.name === 'string', `${n.id} has a name`); }
for (const id of ROLE_ORDER) { checkBonus(ROLES[id].bonus, 'role ' + id); checkBonus(ROLES[id].post, 'post ' + id); ok(ROLES[id].kit, `${id} has a kit`); ok(ROLES[id].color && ROLES[id].icon && ROLES[id].desc, `${id} card fields`); }
for (const [id, k] of Object.entries(T.KEYSTONES)) { checkBonus(k.b, 'keystone ' + id); ok(NODE[id]?.type === 'keystone', `keystone ${id} is a node`); ok(k.name && k.icon, `${id} card`); }
// every KEYS key is used by something a player can reach (no dead keys), and the spec keys exist
for (const k of ['maxMana', 'manaRegen', 'spellPower', 'cooldown', 'bagSlots', 'carry', 'moveSpeed', 'stamina', 'maxHp', 'meleeDmg', 'rangedDmg', 'scrapValue', 'lootLuck', 'scanRange', 'interactSpeed', 'reviveSpeed', 'craftLuck', 'noise']) {
  ok(KEYS[k], `spec key ${k} registered`);
  ok(NODES.some((n) => n.b[k]) || Object.values(ROLES).some((r) => r.bonus[k]), `key ${k} is granted somewhere`);
}
// costs
for (const n of NODES) { ok(Number.isInteger(T.nodeCost(n)) && T.nodeCost(n) >= 1, `${n.id} cost`); ok(T.refundCost(n) > 0, `${n.id} refund cost`); }
ok(T.nodeCost(NODE.ghoststep) > T.nodeCost(NODE.scout_s1), 'keystones cost more than smalls');
// keystone flags / normalisation
for (const id of Object.keys(T.KEYSTONES)) ok(NODE[id].flags.includes(id), `${id} flags`);
eq(T.normId("Scavenger's Luck"), 'scavengersluck', 'normId apostrophe');
eq(T.normId('Blood_Magic'), 'bloodmagic', 'normId underscore');
// geometry: nothing overlaps, edges are drawable
let minD = 1e9, maxE = 0;
for (let i = 0; i < NODES.length; i++) for (let j = i + 1; j < NODES.length; j++) minD = Math.min(minD, Math.hypot(NODES[i].x - NODES[j].x, NODES[i].y - NODES[j].y));
for (const [a, b] of EDGES) maxE = Math.max(maxE, Math.hypot(NODE[a].x - NODE[b].x, NODE[a].y - NODE[b].y));
ok(minD >= 40, `nodes overlap (min distance ${minD.toFixed(1)})`);
ok(maxE <= 95, `edge too long (${maxE.toFixed(1)})`);
console.log(`min node distance ${minD.toFixed(1)}, longest edge ${maxE.toFixed(1)}, radius ${T.TREE_RADIUS.toFixed(0)}`);
// search
ok(T.searchNodes('move speed').size > 5, 'search finds move speed nodes');
ok(T.searchNodes('blood magic').has('bloodmagic'), 'search finds keystone by name');
eq(T.searchNodes('').size, 0, 'empty search');

// ---------------------------------------------------------------- allocation logic
const st = T.emptyRpgState();
ok(!T.planAllocation(st, 'scout_s1').ok, 'no allocation without a role');
st.role = 'scout';
const p1 = T.planAllocation(st, 'scout_s1');
ok(p1.ok && p1.path.length === 1 && p1.cost === 1, 'adjacent node costs 1');
const far = T.planAllocation(st, 'ghoststep');
ok(far.ok && far.path.length >= 6 && far.path.at(-1) === 'ghoststep', `keystone path (${far.path.length} nodes)`);
eq(far.cost, far.path.length - 1 + T.nodeCost(NODE.ghoststep), 'keystone path cost');
// path order: every node is adjacent to the start or an earlier node of the path
{
  const have = T.allocatedSet(st);
  for (const id of far.path) { ok(ADJ[id].some((nb) => have.has(nb)), `path order ${id}`); have.add(id); }
}
st.nodes.push(...far.path);
eq(T.pruneState(JSON.parse(JSON.stringify(st))).length, 0, 'valid state prunes nothing');
ok(!T.planRefund(st, far.path[1]).ok, 'middle of a chain cannot be refunded');
ok(T.planRefund(st, 'ghoststep').ok, 'leaf keystone can be refunded');
ok(!T.planRefund(st, 'start_scout').ok, 'role post cannot be refunded');
const b = T.treeBonus(st);
ok(b.moveSpeed >= ROLES.scout.bonus.moveSpeed, 'role bonus included');
ok(T.treeFlags(st).has('ghoststep'), 'keystone flag');
// role switch: scout chain hangs off scout post -> orphaned for enforcer, refunded
const sw = T.planRoleSwitch(st, 'enforcer');
ok(sw.ok && sw.orphans.length > 0 && sw.clout > 0, 'switching away orphans the chain');
const sw2 = T.planRoleSwitch({ role: 'scout', nodes: [] }, 'medic');
ok(sw2.orphans.length === 0 && sw2.clout === 0, 'empty tree switches for free');
// non-owner start nodes are ordinary connectors
{
  const s2 = { role: 'scout', nodes: [] };
  const pe = T.planAllocation(s2, 'start_enforcer');
  ok(pe.ok && pe.cost >= 2, 'another role post is reachable as a connector');
}
// prune: unknown / disconnected nodes
{
  const bad = { role: 'scout', nodes: ['scout_s1', 'nope', 'enforcer_n1', 'scout_s1'] };
  const removed = T.pruneState(bad);
  ok(removed.includes('nope') && removed.includes('enforcer_n1'), 'prune drops unknown + disconnected');
  eq(bad.nodes.join(','), 'scout_s1', 'prune keeps the valid node once');
}

// ---------------------------------------------------------------- controller (profile level)
const mkProfile = (over = {}) => ({ id: 't' + Math.random(), level: 20, xp: 0, coins: 500, skillPoints: 10, skills: { vit: 0, end: 0, str: 0, agi: 0, lck: 0, tec: 0 }, ...over });
{
  const prof = mkProfile();
  const c = createRpgController(prof, { changed: () => {} });
  ok(!c.allocate('scout_s1').ok, 'controller: allocate needs a role');
  ok(c.setRole('scout').ok, 'controller: set role');
  const r1 = c.allocate('ghoststep');
  ok(!r1.ok || prof.skillPoints < 10, 'controller: allocate whole path (or refuse when short)');
  ok(c.plan('ghoststep').cost > 0 || c.isAllocated('ghoststep'), 'plan');
  const before = prof.skillPoints;
  const c2 = c.allocate('scout_s1');
  ok(c2.ok && prof.skillPoints === before - 1 || c.isAllocated('scout_s1'), 'controller: single allocation');
  // free undo of a fresh node, refund refund-cost otherwise
  const coins = prof.coins;
  const leafId = prof.rpg.nodes.at(-1);
  const info = c.refundInfo(leafId);
  ok(info.ok, 'leaf refund allowed');
  if (info.ok) { c.refund(leafId); eq(prof.coins, coins, 'refund is free: Followers are never spent'); }
  const all = c.respecAll();
  ok(all.ok || prof.rpg.nodes.length === 0, 'respec ok');
  eq(prof.rpg.nodes.length, 0, 'respec clears nodes');
  eq(prof.skillPoints, 10, 'respec returns every point');
}
{
  // gate: refunds blocked mid-run
  const prof = mkProfile();
  const c = createRpgController(prof, { changed: () => {}, canRespec: () => ({ ok: false, msg: 'no' }), canChangeRole: () => ({ ok: false, msg: 'orbit only' }) });
  ok(!c.setRole('scout').ok, 'role gate blocks');
  prof.rpg.role = 'scout'; prof.rpg.nodes.push('scout_s1');
  ok(!c.refund('scout_s1').ok, 'refund gate blocks');
}
{
  // [followers] role switch with orphans is free (Followers are never spent)
  const prof = mkProfile({ coins: 5, skillPoints: 20 });
  const c = createRpgController(prof, { changed: () => {} });
  c.setRole('scout'); c.allocate('scout_n1'); c.allocate('scout_nl');
  const n = prof.rpg.nodes.length;
  ok(n >= 4, `scout tree has ${n} nodes`);
  const r = c.setRole('enforcer');
  ok(r.ok && prof.coins === 5, 'role switch is free even with 5 followers');
  prof.coins = 5000;
  const spentBefore = T.treeSpent(prof.rpg);
  const r2 = c.setRole('enforcer');
  ok(r2.ok, 'second role switch ok');
  eq(prof.skillPoints, 20 - spentBefore + spentBefore, 'role switch refunds all orphan points');
  ok(prof.rpg.nodes.every((id) => T.reachableFrom('start_enforcer', new Set(['start_enforcer', ...prof.rpg.nodes])).has(id)), 'no orphan after switch');
}

// ---------------------------------------------------------------- migration + stats
{
  const old = { id: 'old', level: 30, xp: 10, coins: 0, skillPoints: 2, skills: { vit: 5, end: 3, str: 0, agi: 4, lck: 1, tec: 0 }, prestige: { stars: 0 } };
  const before = derivedStats(old);
  ensureRpgProfile(old);
  eq(old.skillPoints, 2 + 13, 'migration refunds every legacy skill point');
  ok(Object.values(old.skills).every((v) => v === 0), 'legacy skills zeroed');
  eq(old.rpg.migrated.skills, 13, 'migration remembers the amount');
  ensureRpgProfile(old);
  eq(old.skillPoints, 15, 'migration is idempotent');
  const after = derivedStats(old);
  ok(after.maxHp < before.maxHp && after.speedMul < before.speedMul, 'derived stats drop back to base after the refund');
  // a saved profile with a broken tree
  const broken = { id: 'b', level: 5, xp: 0, coins: 0, skillPoints: 0, skills: {}, rpg: { v: 1, role: 'hauler', nodes: ['hauler_s1', 'ghost', 'scout_s1'] } };
  ensureRpgProfile(broken);
  eq(broken.rpg.nodes.join(','), 'hauler_s1', 'broken saves are pruned');
  eq(broken.skillPoints, 2, 'pruned nodes are refunded');
}
{
  const prof = mkProfile({ skillPoints: 0 });
  const base = derivedStats(prof);
  prof.rpg = { v: 1, role: 'occultist', nodes: [], kit: {} };
  const occ = derivedStats(prof);
  eq(occ.maxHp, base.maxHp - 10, 'occultist role: -10 max hp');
  near(occ.tree.maxMana, 25, 'occultist role: +25 max mana exposed');
  prof.rpg = { v: 1, role: 'scout', nodes: [], kit: {} };
  const sc = derivedStats(prof);
  near(sc.speedMul, base.speedMul + 0.06, 'scout role: +6% move speed');
  eq(sc.scanRange, base.scanRange + 4, 'scout role: +4 m scan');
  // keystones through the stats path
  prof.rpg = { v: 1, role: 'hauler', nodes: ['packmule'], kit: {} };
  const pm = derivedStats(prof);
  ok(pm.carryRelief > 5000 && pm.noSprint, 'Pack Mule: no weight limit, no sprint flag');
  prof.rpg = { v: 1, role: 'enforcer', nodes: ['glasscannon'], kit: {} };
  const gc = derivedStats(prof);
  ok(gc.meleeMul > base.meleeMul * 1.4 && gc.maxHp < base.maxHp, 'Glass Cannon: more damage, less HP');
  // xp / clout gain
  prof.rpg = { v: 1, role: 'scout', nodes: ['ib_1', 'ib_3'], kit: {} };
  near(metaMultipliers(prof).xp, 1.04, 'XP Gain nodes raise the XP multiplier');
  // rebirth counts the tree
  const rb = mkProfile({ level: 60, skillPoints: 0 });
  rb.rpg = { v: 1, role: 'scout', nodes: ['scout_s1', 'scout_s2', 'scout_n1', 'scout_s3'], kit: {} };
  const pv = rebirthPreview(rb);
  eq(pv.spent, 4, 'rebirth preview counts tree points');
  applyRebirth(rb);
  eq(rb.rpg.nodes.length, 0, 'rebirth clears the tree nodes');
  eq(rb.rpg.role, 'scout', 'rebirth keeps the role');
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
