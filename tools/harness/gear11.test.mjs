// gear11: five gadgets are registered + buyable, pure rules (jam pick, trail dots, zipline, drone flight / tether / scan picking), speaker rides grenades, i18n.
// Run: node tools/harness/gear11.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/gear11_core.js';
import '../../src/game/gear11.js';
import { ITEMS, STORE_ITEMS } from '../../src/game/items.js';
import { catalogEntries } from '../../src/game/shop.js';
import { KINDS, kindOfItem, STORE_KINDS } from '../../src/game/grenades_core.js';
import { setLang, t } from '../../src/core/i18n.js';

let fail = 0;
const ok = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n    ' + e.message); } };

ok('four gadgets registered, priced, in the store; speaker is a grenade kind', () => {
  const ids = catalogEntries().map((e) => e.id);
  for (const id of C.ITEM_IDS) { assert.ok(ITEMS[id], id); assert.ok(STORE_ITEMS.includes(id), id + ' in STORE_ITEMS'); assert.ok(ids.includes(id), id + ' in catalogue'); assert.ok(ITEMS[id].price > 0); }
  assert.equal(ITEMS.scoutdrone.battery, C.DRONE.sec);
  assert.equal(kindOfItem('decoyspeaker'), 'speaker');
  assert.ok(STORE_KINDS.includes('speaker'));
  assert.ok(KINDS.speaker.dur === 12 && KINDS.speaker.pulse >= 2 && KINDS.speaker.noise >= KINDS.decoy.noise);
});
ok('door jammer: plain doors only, in front, in reach', () => {
  const door = (id, x, z, o = {}) => ({ id, kind: 'door', locked: false, pos: { x, y: 0, z }, info: {}, ...o });
  assert.equal(C.canJam(door('a', 0, 0)), true);
  for (const bad of [{ kind: 'vault' }, { locked: true }, { teleport: true }, { info: { arena: true } }, { info: { shortcut: true } }, { jam: 5 }]) assert.equal(C.canJam(door('x', 0, 0, bad)), false);
  const doors = [door('near', 0, -2), door('behind', 0, 2), door('far', 0, -9)];
  assert.equal(C.pickDoor(doors, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })?.id, 'near');
  assert.equal(C.pickDoor([doors[1], doors[2]], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }), null);
  assert.ok(C.jamBeepGap(30) > 10 && C.jamBeepGap(1) < C.jamBeepGap(5));
});
ok('glow trail: spacing, fade, colours, host sanity', () => {
  assert.equal(C.trailShouldDrop(null, { x: 0, y: 0, z: 0 }), true);
  assert.equal(C.trailShouldDrop({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), false);
  assert.equal(C.trailShouldDrop({ x: 0, y: 0, z: 0 }, { x: 3.5, y: 0, z: 0 }), true);
  assert.equal(C.dotAlpha(10), 1); assert.ok(C.dotAlpha(C.TRAIL.life - 5) < 1 && C.dotAlpha(C.TRAIL.life - 5) > 0); assert.equal(C.dotAlpha(C.TRAIL.life), 0);
  assert.equal(C.trailColorIdx('peerA'), C.trailColorIdx('peerA'));
  assert.ok(Math.abs(C.backHeading({ x: 0, z: 0 }, { x: 0, z: 5 })) < 1e-9);
  assert.equal(C.dotOk(null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 50, 10), true);
  assert.equal(C.dotOk(null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 10), false);          // spray ran out
  assert.equal(C.dotOk(null, { x: 30, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 50, 10), false);         // teleporting dot
  assert.equal(C.dotOk({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, 50, 10), false);   // spam
});
ok('zipline: anchor validation, geometry, load slows the ride', () => {
  const a = { x: 0, y: 2.4, z: 0 };
  assert.equal(C.validateAnchor(a, null).ok, false);
  assert.equal(C.validateAnchor(a, { x: 0, y: 2, z: -10 }, { x: 0, y: 0, z: 1 }).ok, true);
  assert.equal(C.validateAnchor(a, { x: 0, y: 2, z: -25 }, { x: 0, y: 0, z: 1 }).reason, 'far');
  assert.equal(C.validateAnchor(a, { x: 0, y: 2, z: -1 }, { x: 0, y: 0, z: 1 }).reason, 'near');
  assert.equal(C.validateAnchor(a, { x: 0, y: 0, z: -8 }, { x: 0, y: 1, z: 0 }).reason, 'floor');
  assert.equal(C.validateAnchor(a, { x: 0, y: 5, z: -8 }, { x: 0, y: -1, z: 0 }).ok, true);     // ceiling
  assert.deepEqual(C.zipPoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 4, z: 0 }, 0.5), { x: 5, y: 2, z: 0 });
  assert.equal(C.hangFeet({ x: 0, y: 5, z: 0 }, { x: 0, y: 5, z: 10 }, 0.5).y, 3);
  assert.equal(C.hangFeet({ x: 0, y: 5, z: 0 }, { x: 0, y: 5, z: 10 }, 0.5, 4).y, 4.03);         // never below the floor
  assert.equal(C.zipSpeed(0, false, 1), C.ZIP.speed);
  assert.ok(C.zipSpeed(60, false, 1) < C.ZIP.speed && C.zipSpeed(200, true, 0.5) >= 1);
  assert.equal(C.nearestEnd({ x: 0, y: 2.4, z: 0 }, { x: 10, y: 2.4, z: 0 }, { x: 0.5, y: 0.4, z: 0 }), 'a');
  assert.equal(C.nearestEnd({ x: 0, y: 2.4, z: 0 }, { x: 10, y: 2.4, z: 0 }, { x: 5, y: 0.4, z: 0 }), null);
});
ok('drone: flies, stops at a wall, slides, tether clamps, link fades', () => {
  const wallZ = -5;   // solid plane at z = -5 (normal +z)
  const ray = (ox, oy, oz, dx, dy, dz, len) => { if (dz >= -1e-6) return null; const dist = (wallZ - oz) / dz; return dist >= 0 && dist <= len ? { distance: dist, nx: 0, ny: 0, nz: 1 } : null; };
  const d = C.newDrone({ x: 0, y: 1.5, z: 0 }, 0, 0);
  for (let i = 0; i < 300; i++) C.stepDrone(d, { f: 1, s: 0, u: 0 }, 1 / 60, ray);
  assert.ok(d.z > wallZ + 0.2 && d.z < wallZ + 0.6, 'stopped at the wall: ' + d.z);
  const x0 = d.x;
  for (let i = 0; i < 60; i++) C.stepDrone(d, { f: 1, s: 1, u: 0 }, 1 / 60, ray);
  assert.ok(d.x > x0 + 1, 'slides along the wall');
  const far = C.newDrone({ x: 100, y: 1, z: 0 });
  const q = C.tether(far, { x: 0, y: 1, z: 0 });
  assert.ok(Math.hypot(far.x, far.z) <= C.DRONE.tether + 1e-6 && q === 0);
  assert.equal(C.linkQuality(5), 1); assert.ok(C.linkQuality(35) < 1 && C.linkQuality(35) > 0);
});
ok('drone scan: line of sight, range, creatures first, capped; creature touch smashes', () => {
  const c = [{ k: 'i', x: 3, y: 0, z: 0 }, { k: 'c', x: 8, y: 0, z: 0 }, { k: 'i', x: 30, y: 0, z: 0 }, { k: 'i', x: 5, y: 0, z: 0 }, { k: 'c', x: 6, y: 0, z: 9 }];
  const out = C.pickTargets(c, { x: 0, y: 0, z: 0 }, (o, t2) => t2.z < 5);
  assert.deepEqual(out.map((r) => r.k + r.x), ['c8', 'i3', 'i5']);
  assert.equal(C.pickTargets(Array.from({ length: 30 }, (_, i) => ({ k: 'i', x: 1 + i * 0.1, y: 0, z: 0 })), { x: 0, y: 0, z: 0 }, null).length, C.DRONE.maxPings);
  assert.equal(C.droneHit({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }), true); assert.equal(C.droneHit({ x: 0, y: 1, z: 0 }, { x: 4, y: 1, z: 0 }), false);
});
ok('every gadget has TR + RU text', () => {
  for (const en of [...C.ITEM_IDS.map((id) => ITEMS[id].name), 'Decoy Speaker']) {
    const id = en;
    setLang('tr'); const tr = t(en); setLang('ru'); const ru = t(en); setLang('en');
    assert.notEqual(tr, en, id + ' TR'); assert.notEqual(ru, en, id + ' RU');
  }
  for (const id of C.ITEM_IDS) { setLang('tr'); assert.notEqual(t(C.ITEMS11[id].tip), C.ITEMS11[id].tip, id + ' tip TR'); setLang('ru'); assert.notEqual(t(C.ITEMS11[id].tip), C.ITEMS11[id].tip, id + ' tip RU'); setLang('en'); }
});

console.log(fail ? `\n${fail} FAILED` : '\nall gear11 tests passed');
process.exit(fail ? 1 : 0);
