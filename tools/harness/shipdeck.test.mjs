// node tools/harness/shipdeck.test.mjs - wave 5 shipdeck: Upper Deck rules (shipyard_core) + a WALK TEST up the real stair with the real Rapier character
// controller (same settings as physics.js createController): from the hub floor, up lane A, over the turning platform, up lane B, out of the hatch onto the
// deck; walking / sprinting, pressing sideways into the walls; and "cannot fall": the rails at the well and the deck edge hold, the ceiling is solid beside the hatch.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import { Physics, initPhysics, G, groups } from '../../src/physics/physics.js';
import * as L from '../../src/world/shiplayout.js';
import * as Y from '../../src/game/shipyard_core.js';

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } };

// ------------------------------------------------------------------------------------------------ rules
ok('state: blank ship has no deck; sanitize clamps tier, drops rooms of slots that are not built, duplicates and junk', () => {
  assert.deepEqual(Y.blankState().deck, { t: 0, rooms: [null, null, null, null] });
  assert.deepEqual(Y.sanitize({}).deck, Y.blankDeck());
  assert.deepEqual(Y.sanitizeDeck({ t: 9, rooms: ['bunk', 'bunk', 'store', 'lava', 'x'] }), { t: 3, rooms: ['bunk', null, 'store', null] });
  assert.deepEqual(Y.sanitizeDeck({ t: 2, rooms: ['bunk', 'store', 'turret', 'lounge'] }), { t: 2, rooms: ['bunk', 'store', null, null] });
  assert.deepEqual(Y.sanitizeDeck({ t: 1, rooms: ['bunk'] }).rooms, [null, null, null, null]);
  assert.equal(Y.sanitize({ deck: { t: 2, rooms: ['bunk'] } }).deck.rooms[0], 'bunk');
});
ok('buy: Mk I -> II -> III with credits (450 / 800 / 1500) or ship parts, host-style wallet, no overdraft, maxed at III', () => {
  const s = Y.blankState(), w = { cr: 5000 };
  assert.deepEqual(Y.deckQuote(s).parts, { plate: 6, bulk: 4, coil: 1, brk: 1 });
  assert.equal(Y.tryDeckUp(s, { cr: 100 }, 'credits').ok, false);
  assert.equal(Y.tryDeckUp(s, w, 'parts').ok, false, 'no parts in stock');
  assert.deepEqual([Y.tryDeckUp(s, w, 'credits').t, Y.tryDeckUp(s, w, 'credits').t, Y.tryDeckUp(s, w, 'credits').t], [1, 2, 3]);
  assert.equal(w.cr, 5000 - 450 - 800 - 1500);
  assert.equal(Y.tryDeckUp(s, w, 'credits').ok, false); assert.equal(Y.deckQuote(s).maxed, true);
  const p = Y.blankState(); p.parts = { plate: 30, bulk: 30, coil: 30, brk: 30 }; const w2 = { cr: 0 };
  assert.equal(Y.tryDeckUp(p, w2, 'parts').ok, true); assert.equal(p.parts.plate, 24); assert.equal(w2.cr, 0);
});
ok('rooms: slots need the tier (Mk II = 2, Mk III = 4), a room stands in one slot only, changing costs credits, clearing is free', () => {
  const s = Y.blankState(), w = { cr: 1000 };
  assert.equal(Y.tryDeckRoom(s, w, 0, 'bunk').ok, false, 'no deck yet');
  s.deck.t = 2;
  assert.equal(Y.tryDeckRoom(s, w, 2, 'bunk').ok, false, 'slot 2 needs Mk III');
  assert.equal(Y.tryDeckRoom(s, w, 0, 'bunk').ok, true); assert.equal(w.cr, 1000 - Y.DECK_ROOM_CR);
  assert.equal(Y.tryDeckRoom(s, w, 0, 'bunk').ok, false, 'nothing changed');
  assert.equal(Y.tryDeckRoom(s, w, 1, 'bunk').ok, true); assert.deepEqual(s.deck.rooms, [null, 'bunk', null, null]);
  assert.equal(Y.tryDeckRoom(s, w, 1, 'lava').ok, false);
  const cr = w.cr; assert.equal(Y.tryDeckRoom(s, w, 1, null).ok, true); assert.equal(w.cr, cr);
  assert.equal(Y.tryDeckRoom(s, { cr: 5 }, 0, 'store').ok, false);
});
ok('effects: unchanged without a deck; rooms give small bonuses only when the matching module is built', () => {
  const base = Y.effects(Y.blankState()); assert.equal(base.deck, 0);
  const s = Y.blankState(); s.m = { R1: { id: 'cargo', t: 1 }, TURRET: { id: 'turret', t: 1 }, N1: { id: 'bunk', t: 1 }, N2: { id: 'lounge', t: 2 } };
  const e0 = Y.effects(s); s.deck = { t: 3, rooms: ['store', 'turret', 'bunk', 'lounge'] }; const e1 = Y.effects(s);
  assert.equal(e1.cargoSlots, e0.cargoSlots + 6); assert.ok(e1.turretRate > e0.turretRate); assert.equal(e1.restSec, e0.restSec + 60); assert.ok(e1.jamMul > e0.jamMul);
  const s2 = Y.blankState(); s2.deck = { t: 3, rooms: ['store', 'turret', 'bunk', 'lounge'] }; const e2 = Y.effects(s2);
  assert.equal(e2.cargoSlots, 0); assert.equal(e2.turretRate, 0); assert.equal(e2.restSec, 0); assert.equal(e2.jamMul, 1);
});

// ------------------------------------------------------------------------------------------------ walk test (real Rapier controller)
await initPhysics();
const HALF = 0.56, RAD = 0.34, DT = 1 / 60;
function world(t = 3, rooms = L.DECK_ROOMS) {
  const ph = new Physics();
  ph.addStaticBox(0, -0.25, 0, 8, 0.25, 4.5);                                                     // hub floor (top y 0)
  for (const [x0, z0, x1, z1] of L.withoutWell(-7.5, -4, 7.5, 4)) ph.addStaticBox((x0 + x1) / 2, L.SHELL.h + 0.25, (z0 + z1) / 2, (x1 - x0) / 2, 0.25, (z1 - z0) / 2);   // ceiling + roof with the hatch
  for (const c of L.deckColliders(t, rooms)) ph.addStaticBox(c.cx, c.cy, c.cz, c.sx / 2, c.sy / 2, c.sz / 2, c.q || 0);
  return ph;
}
/** walk through waypoints [[x, z], ...] at `speed`; `lat` = extra sideways push (m/s fraction) in the walking frame; returns { pos, feetY, minFeet, t, done } */
function walk(ph, start, way, { speed = 5, lat = 0, max = 30 } = {}) {
  const feet0 = start.y ?? 0;
  const p0 = { x: start.x, y: feet0 + HALF + RAD + 0.02, z: start.z };
  const { body, col } = ph.createKinematicCapsule(p0, HALF, RAD, G.PLAYER, G.STATIC | G.DOOR, { kind: 'p' });
  const ctrl = ph.createController(0.02); ph.world.step();
  let pos = { ...p0 }, vel = { x: 0, y: 0, z: 0 }, grounded = false, t = 0, wi = 0, minFeet = 1e9;
  for (; t < max; t += DT) {
    const [wx, wz] = way[wi]; let dx = wx - pos.x, dz = wz - pos.z; const d = Math.hypot(dx, dz);
    if (d < 0.22) { wi++; if (wi >= way.length) break; continue; }
    dx /= d; dz /= d;
    const tx = dx * speed + -dz * lat * speed, tz = dz * speed + dx * lat * speed;
    vel.x += (tx - vel.x) * Math.min(1, 20 * DT); vel.z += (tz - vel.z) * Math.min(1, 20 * DT);
    if (!grounded || vel.y > 0) vel.y -= 19.6 * DT; else vel.y = -1.0;
    const mv0 = { x: vel.x * DT, y: (grounded && vel.y <= 0) ? 0 : vel.y * DT, z: vel.z * DT };
    ctrl.computeColliderMovement(col, mv0, undefined, groups(G.PLAYER, G.STATIC | G.DOOR));
    const mv = ctrl.computedMovement(); grounded = ctrl.computedGrounded();
    pos = { x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z };
    body.setNextKinematicTranslation(pos); body.setTranslation(pos, true); ph.world.step();
    if (Math.abs(mv.x) < Math.abs(vel.x) * DT * 0.3) vel.x = mv.x / DT;
    if (Math.abs(mv.z) < Math.abs(vel.z) * DT * 0.3) vel.z = mv.z / DT;
    minFeet = Math.min(minFeet, pos.y - HALF - RAD);
  }
  return { pos, feetY: pos.y - HALF - RAD, minFeet, t, done: wi >= way.length };
}
const S = L.deckStairs(), A = S.a, B = S.b, W = L.WELL;
const ax = A.x, bx = B.x, platZ = (S.platform.z0 + S.platform.z1) / 2;
// hub floor -> foot of lane A -> up A -> platform -> across -> up B -> out of the hatch -> onto the deck
const ROUTE = [[ax, W.z1 + 0.9], [ax, W.z1 - 0.3], [ax, platZ + 0.1], [(ax + bx) / 2, platZ], [bx, platZ + 0.05], [bx, B.z + 0.3], [bx, W.z1 - 0.2], [bx, W.z1 + 0.6]];
for (const speed of [5, 8.2]) for (const lat of [0, 0.3, -0.3]) {
  ok(`walk: hub floor -> lane A -> platform -> lane B -> deck at ${speed} m/s, sideways push ${lat}: arrives with the feet at y ${L.DECK.y}, never falls`, () => {
    const r = walk(world(), { x: ax, z: W.z1 + 1.5, y: 0 }, ROUTE, { speed, lat });
    assert.ok(r.done, `route not finished: at (${r.pos.x.toFixed(2)}, ${r.pos.z.toFixed(2)}) feet ${r.feetY.toFixed(2)} after ${r.t.toFixed(1)} s`);
    assert.ok(Math.abs(r.feetY - L.DECK.y) < 0.12, 'feet ' + r.feetY.toFixed(2)); assert.ok(r.minFeet > -0.2, 'fell to ' + r.minFeet.toFixed(2));
  });
}
ok('walk: the Mk I bare deck (no rooms, rails only) can be climbed too, and the way back down works (deck -> B -> platform -> A -> floor)', () => {
  const w = world(1, []);
  const up = walk(w, { x: ax, z: W.z1 + 1.5, y: 0 }, ROUTE); assert.ok(up.done && Math.abs(up.feetY - L.DECK.y) < 0.12);
  const down = walk(world(1, []), { x: bx, z: W.z1 + 1.1, y: L.DECK.y }, [[bx, W.z1 - 0.3], [bx, platZ + 0.4], [bx, platZ], [ax, platZ], [ax, platZ + 0.5], [ax, W.z1 - 0.3], [ax, W.z1 + 0.9]]);
  assert.ok(down.done, 'down route unfinished at ' + JSON.stringify(down.pos)); assert.ok(down.feetY < 0.15, 'feet ' + down.feetY.toFixed(2));
});
ok('cannot fall: the rail round the well holds from the deck side (west, north, east), so does the deck edge and the cabin wall', () => {
  const y = L.DECK.y, mid = (W.z0 + W.z1) / 2;
  for (const [name, start, way] of [['west rail', { x: 0.2, z: mid }, [[W.x0 + 0.6, mid]]], ['north rail', { x: 1.9, z: W.z0 - 0.5 }, [[1.9, W.z0 + 0.6]]], ['east rail', { x: W.x1 + 0.5, z: mid }, [[W.x1 - 0.6, mid]]],
    ['deck edge S', { x: 0.2, z: 2.0 }, [[0.2, L.DECK.z1 + 1.0]]], ['deck edge W', { x: 0.2, z: 0 }, [[L.DECK.x0 - 1.0, 0]]], ['deck edge E', { x: 3.6, z: 0 }, [[L.DECK.x1 + 1.0, 0]]], ['deck edge N', { x: 1.9, z: -2.0 }, [[1.9, L.DECK.z0 - 1.0]]]]) {
    const r = walk(world(), { ...start, y }, way, { speed: 6, max: 6 });
    assert.ok(r.minFeet > y - 0.15, `${name}: fell to ${r.minFeet.toFixed(2)} (at ${r.pos.x.toFixed(2)}, ${r.pos.z.toFixed(2)})`);
  }
});
ok('cannot fall: on lane B (mid-climb) pushing west into the divider / east into the housing keeps the player on the stair', () => {
  for (const tx of [B.x - 2, B.x + 2]) {
    const r = walk(world(), { x: bx, z: platZ + 0.4, y: S.platform.y }, [[bx, B.z + 0.6], [tx, B.z + 0.9]], { speed: 5, max: 5 });
    assert.ok(r.minFeet > S.platform.y - 0.1, 'fell to ' + r.minFeet.toFixed(2));
  }
});
ok('the ceiling is solid beside the hatch: a jump from the hub floor does not get through, the lid position is closed only by the ship (deckHatch)', () => {
  const ph = world(0, []);   // tier 0: the ship's lid (a collider in ship.js) closes the well
  ph.addStaticBox((W.x0 + W.x1) / 2, L.SHELL.h + 0.25, (W.z0 + W.z1) / 2, (W.x1 - W.x0) / 2, 0.25, (W.z1 - W.z0) / 2);
  const r = walk(ph, { x: 1.9, z: 0, y: 0 }, [[1.9, 0.4]], { speed: 3, max: 2 }); assert.ok(r.feetY < 0.1);
});

console.log(`\nshipdeck: ${pass} passed, ${fail} failed`);
