import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';

// Native Game imports CSS; the canvas/renderer boundary is recorded, not rendered.
// As in descent21_lifecycle, this does not construct a browser or Game boot UI.
register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const canvas = () => ({ width: 0, height: 0, style: {}, remove() {}, getContext: () => new Proxy({}, {
  get: (_, k) => k === 'measureText' ? () => ({ width: 10 }) :
    ['createLinearGradient', 'createRadialGradient'].includes(k) ? () => ({ addColorStop() {} }) :
      ['getImageData', 'createImageData'].includes(k) ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {},
  set: () => true,
}) });
globalThis.window = globalThis;
globalThis.document = { createElement: canvas, documentElement: {}, body: { appendChild() {} }, head: { appendChild() {} }, addEventListener() {}, getElementById: () => null };
globalThis.localStorage = { getItem: () => null };
globalThis.addEventListener = globalThis.removeEventListener = () => {};

const THREE = await import('three');
const { initPhysics, Physics } = await import('../../src/physics/physics.js');
const { LightPool } = await import('../../src/render/lightpool.js');
const { ItemManager } = await import('../../src/entities/items.js');
const { Emitter, errLog } = await import('../../src/core/events.js');
const { installLandQ } = await import('../../src/game/landingq.js');
const { installWarmSet } = await import('../../src/game/warmset.js');
const { Game } = await import('../../src/game/game.js');
await initPhysics();

const hash = a => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
function geometry(group) {
  const out = [];
  group.traverse(o => {
    if (!o.isMesh) return;
    o.updateMatrix();
    out.push([o.name, o.matrix.toArray(), Object.entries(o.geometry.attributes).map(([k, a]) => [k, a.itemSize, hash(a.array)]),
      o.geometry.index ? hash(o.geometry.index.array) : null, o.instanceMatrix ? hash(o.instanceMatrix.array) : null,
      o.instanceColor ? hash(o.instanceColor.array) : null,
      [].concat(o.material).map(m => [m.type, m.name, m.color?.toArray(), m.vertexColors, m.transparent, m.side])]);
  });
  return out;
}
function snapshot(g) {
  const { facility: f, outdoor: o } = g.world;
  const cols = colliders => colliders.map(c => [c.translation(), c.rotation(), c.collisionGroups(), c.shape.type, c.halfExtents?.(), g.physics.infoOf(c)?.kind]);
  return {
    facility: geometry(f.group), outdoor: geometry(o.group), walk: hash(f.nav.walk), locks: [...f.nav.blockedEdges],
    doors: f.doors.map(d => [d.id, d.kind, d.info, d.pos.toArray(), d.locked, d.open, d.colArgs]),
    scrap: f.scrapSpots, big: f.bigSpots, chests: f.chestSpots,
    facilityColliders: cols(f.colliders), outdoorColliders: cols(o.colliders),
    mainSpawn: o.mainExit.spawn.toArray(), generation: f.descent21Generation, depth: g.world.descent21Depth,
  };
}
function fixture() {
  const scene = new THREE.Scene(), physics = new Physics(), lights = new LightPool(scene), mods = new Emitter();
  const events = [], observed = [], renderTargets = [], uploaded = [];
  let currentTarget = { label: 'previous-target' };
  const previousTarget = currentTarget;
  const g = Object.assign(Object.create(Game.prototype), {
    scene, physics, lights, mods, profile: {},
    world: { moonId: null, seed: null, facility: null, outdoor: null, company: null, terrain: null, mapGroup: null },
    run: { phase: 'landing', moon: 'hamsi', seed: 699464887, weather: 'rainy' },
    env: { landingT: 0, indoor: false, setMoon(...args) { events.push('environment'); observed.push(['environment', args]); }, setSpace() {} },
    player: { pos: new THREE.Vector3(), dead: false, slots: [null, null, null, null], slot: 0 },
    net: { selfId: 'host', hostId: 'host', isHost: true },
    creatures: { clearAll() {} }, onItemHeld() {}, onItemDropped() {},
    engine: { scene, camera: new THREE.PerspectiveCamera(), rt: { label: 'native-render-target' }, renderer: {
      info: { programs: [] }, getRenderTarget: () => currentTarget,
      setRenderTarget(target) { currentTarget = target; renderTargets.push(target); },
      initTexture(tex) { uploaded.push(tex); },
      compile(compiledScene, camera) { assert.equal(compiledScene, scene); assert.equal(camera, g.engine.camera); observe('prewarm'); },
    } },
  });
  const observe = name => {
    const w = g.world, f = w.facility, o = w.outdoor;
    events.push(name);
    observed.push([name, { complete: !!(f?.nav && f?.doors && o?.terrain),
      facilityParent: f?.group.parent === scene, outdoorParent: o?.group.parent === scene,
      seed: f?.layout.seed, generation: f?.descent21Generation, depth: w.descent21Depth,
      cancellationOwners: g.landQ.clearCleanups.size }]);
  };
  g.items = new ItemManager(g);
  g.landQ = installLandQ(g); g.landQ.startDelay = 0;
  g.warmSet = installWarmSet(g);
  mods.on('mapLoaded', (world, game) => { assert.equal(world, g.world); assert.equal(game, g); observe('mapLoaded'); });
  mods.on('warm', (_register, game) => { assert.equal(game, g); observe('warm'); });
  const pumpUntil = predicate => {
    let ticks = 0;
    while (!predicate()) { assert.ok(g.landQ.pending, 'queued work must still exist before requested state'); g.landQ.tick(1 / 60); assert.ok(++ticks < 700, 'bounded native landing drain'); }
    return ticks;
  };
  const assertConsumers = expected => {
    assert.deepEqual(events.filter(e => ['mapLoaded', 'warm', 'prewarm'].includes(e)), expected);
    for (const [name, state] of observed.filter(([name]) => expected.includes(name))) {
      assert.equal(state.complete, true, name + ' sees complete native map');
      assert.equal(state.facilityParent, true, name + ' sees published facility scene ownership');
      assert.equal(state.outdoorParent, true, name + ' sees published outdoor scene ownership');
      assert.equal(state.seed, g.run.seed); assert.equal(state.generation.seed, g.run.seed);
      assert.equal(state.depth, 0); assert.equal(state.cancellationOwners, 0);
    }
  };
  const release = () => { g.unloadMap(); g.items.clearAll(); g.items.dispose(); g.warmSet.dispose(); g.landQ.dispose(); mods.clear(); assert.equal(physics.info.size, 0); assert.equal(lights.emitters.size, 0); physics.world.free(); };
  return { g, events, observed, renderTargets, uploaded, previousTarget, pumpUntil, assertConsumers, release };
}
const failures = [], warn = console.warn, error = console.error, oldErrors = errLog.total;
console.warn = (...args) => { failures.push(['warn', ...args.map(String)]); warn(...args); };
console.error = (...args) => { failures.push(['error', ...args.map(String)]); error(...args); };
try {
  let expected;
  // Actual Game instant loading remains synchronous and emits only mapLoaded.
  {
    const t = fixture();
    try {
      t.g.loadMapFor(t.g.run, true); assert.ok(t.g.world.facility); assert.ok(t.g.world.outdoor); assert.equal(t.g.landQ.pending, 0);
      t.assertConsumers(['mapLoaded']); assert.equal(t.g.env.landingT, 1); assert.equal(t.g.world.mapGroup.position.y, 0);
      assert.equal(t.g.weatherMud, true); assert.equal(t.g.world.terrain, t.g.world.outdoor.terrain); expected = snapshot(t.g);
    } finally { t.release(); }
  }
  // Real emitSliced, warm planning/model jobs and prewarm consume only final output.
  {
    const t = fixture();
    try {
      t.g.loadMapFor(t.g.run, false); assert.equal(t.g.world.outdoor, null); assert.equal(t.g.world.facility, null);
      const ticks = t.pumpUntil(() => !t.g.landQ.pending);
      t.assertConsumers(['mapLoaded', 'warm', 'prewarm']); assert.deepEqual(snapshot(t.g), expected, 'actual Game synchronous/staged geometry/nav/door/collider/spawn parity');
      assert.equal(t.g.env.landingT, 0); assert.equal(t.g.world.mapGroup.position.y, -260); assert.equal(t.g.weatherMud, true);
      assert.ok(t.g.env.fogCap > 0); assert.equal(t.g.env.interiorFog, t.g.world.facility.atmosphere || null);
      assert.equal(t.g.landQ.clearCleanups.size, 0); assert.equal(t.g.landQ.afterPrewarm.length, 0);
      assert.equal(t.g.scene.children.some(o => o.name === 'warmset'), false, 'native prewarm removes warm group');
      assert.ok(t.uploaded.length > 0, 'actual warm set texture-upload path ran');
      assert.deepEqual(t.renderTargets, [t.g.engine.rt, t.previousTarget], 'native prewarm restores previous renderer target');
      assert.ok(t.g.landQ.last.filter(j => j.name.startsWith('facility:')).length > 1);
      assert.ok(t.g.landQ.last.filter(j => j.name.startsWith('outdoor:')).length > 1);
      console.log('maploading30 completed native Game landing', JSON.stringify({ ticks, outdoorChunks: t.g.landQ.last.filter(j => j.name.startsWith('outdoor:')).length, facilityChunks: t.g.landQ.last.filter(j => j.name.startsWith('facility:')).length }));
    } finally { t.release(); }
  }
  // Actual unload owns partial detached builds, completed outdoor, and native item custody.
  for (const phase of ['outdoor', 'facility']) {
    const t = fixture();
    try {
      t.g.loadMapFor(t.g.run, false);
      // Spawn after loadMapFor's initial unload: explicit native event fixture, not a pickup outcome.
      for (const d of [{ id: 'ship', ty: 'mug', v: 40, p: [0, 1, 0] }, { id: 'held', ty: 'mug', v: 35, h: 'host', iv: { k: 'bag', x: 0, y: 0 }, p: [0, 0, 0] }, { id: 'outside', ty: 'bolt', v: 25, p: [60, 1, 60] }]) t.g.items.onEvent({ e: 'sp', ...d });
      const ship = t.g.items.get('ship'), held = t.g.items.get('held'), shipCol = ship.col.handle;
      const nativeItemColliders = t.g.physics.info.size;
      t.pumpUntil(() => t.g.landQ.clearCleanups.size > 0 && t.g.physics.info.size > nativeItemColliders &&
        (phase === 'outdoor' ? !t.g.world.outdoor : !!t.g.world.outdoor && !t.g.world.facility));
      assert.equal(t.g.world.facility, null); assert.ok(t.g.landQ.pending > 0);
      assert.equal(t.events.includes('mapLoaded'), false); assert.equal(t.events.includes('warm'), false);
      if (phase === 'outdoor') assert.equal(t.g.world.outdoor, null, 'partial outdoor is detached');
      else assert.equal(t.g.world.outdoor.group.parent, t.g.scene, 'completed outdoor is world-owned before partial facility');
      t.g.unloadMap(); t.g.unloadMap(); t.g.landQ.flush();
      for (const key of ['moonId', 'outdoor', 'facility', 'company', 'terrain', 'mapGroup']) assert.equal(t.g.world[key], null, key + ' released');
      assert.equal(t.g.landQ.pending, 0); assert.equal(t.g.landQ.clearCleanups.size, 0); assert.equal(t.g.landQ.afterPrewarm.length, 0);
      assert.equal(t.g.physics.info.size, 1, 'only native ship-item collider remains after map and outside-item cleanup');
      assert.equal(t.g.physics.info.get(shipCol)?.itemId, 'ship'); assert.equal(t.g.lights.emitters.size, 0);
      assert.equal(t.g.items.get('outside'), undefined); assert.equal(t.g.items.get('ship'), ship); assert.equal(ship.value, 40);
      assert.equal(t.g.items.get('held'), held); assert.equal(held.value, 35); assert.equal(held.holder, 'host'); assert.equal(held.inv.k, 'bag');
      assert.equal(t.events.some(e => ['mapLoaded', 'warm', 'prewarm'].includes(e)), false, 'cancelled map never reaches callbacks');
      assert.equal(t.g.scene.children.some(o => o.name === 'warmset'), false);
      console.log('maploading30 native Game unload during partial ' + phase + ': PASS');
    } finally { t.release(); }
  }
  // Native instant admission flushes already queued continuations before same-map early return.
  {
    const t = fixture();
    try {
      t.g.loadMapFor(t.g.run, false); t.pumpUntil(() => t.g.landQ.clearCleanups.size > 0 && !t.g.world.outdoor);
      assert.equal(t.g.world.facility, null); t.g.loadMapFor(t.g.run, true);
      assert.equal(t.g.landQ.pending, 0); t.assertConsumers(['mapLoaded', 'warm', 'prewarm']); assert.deepEqual(snapshot(t.g), expected);
      const f = t.g.world.facility, o = t.g.world.outdoor; t.g.loadMapFor(t.g.run, true);
      assert.equal(t.g.world.facility, f); assert.equal(t.g.world.outdoor, o); t.assertConsumers(['mapLoaded', 'warm', 'prewarm']);
    } finally { t.release(); }
  }
  assert.equal(errLog.total, oldErrors, 'native event handlers reported no swallowed errors');
  assert.deepEqual(failures, [], 'native queue/build/warm paths reported no swallowed warnings/errors');
} finally { console.warn = warn; console.error = error; }
console.log('maploading30 native Game/Physics/LightPool/ItemManager/staged/instant/unload integration: PASS');
