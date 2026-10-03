// Native art/resource boundary: actual facility, LightPool, Rapier and Backrooms updates.
// No renderer or human-play claim. Missing map-owned sky is the initial RED.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import './ship2_env.mjs';
import * as THREE from 'three';
import { LightPool } from '../../src/render/lightpool.js';
import { initPhysics, Physics, G } from '../../src/physics/physics.js';
import { Emitter, errLog } from '../../src/core/events.js';
import { setLang, t } from '../../src/core/i18n.js';

register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c);} "));
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const { getInterior } = await import('../../src/world/interiors/index.js');
await initPhysics();
const scene = new THREE.Scene(), physics = new Physics(), lightPool = new LightPool(scene);
const lights = () => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; };
const initialLights = lights();
const L = generateLayout(0x3535, 'factory', 1, { open35: 'courtyard' });
const fac = buildFacility(L, { physics, lightPool });
scene.add(fac.group);
const sky = fac.group.getObjectByName('openplaces35-sky');
assert.ok(sky?.isMesh, 'an admitted facility must own a cloudy skylight mesh through its native map lifecycle');
const { openPlaceStyle35, openPlaceCeiling35, buildOpenPlaceSky35 } = await import('../../src/world/interiors/openplaces35_art.js');
const { installBackroomsLevels } = await import('../../src/game/brlevels.js');
let passed = 1;
const pass = label => { passed++; console.log('PASS', label); };

// A per-layout style change must not repaint the registered theme or affect a legacy map.
const base = getInterior('office'), old = JSON.stringify(base);
assert.equal(openPlaceStyle35(base, { ...L, open35: null }), base);
assert.equal(openPlaceStyle35(base, { ...L, open35: { ...L.open35, version: 34 } }), base);
const untouched = new THREE.Group();
assert.equal(buildOpenPlaceSky35({ layout: { ...L, open35: null }, group: untouched }), null);
assert.equal(buildOpenPlaceSky35({ layout: { ...L, open35: { ...L.open35, kind: 'unknown' } }, group: untouched }), null);
assert.equal(untouched.children.length, 0);
const styled = openPlaceStyle35(base, L);
assert.notEqual(styled, base); assert.notEqual(styled.style, base.style);
assert.notEqual(styled.style.rooms, base.style.rooms);
assert.equal(styled.style.rooms.generator, base.style.rooms.generator);
assert.equal(JSON.stringify(base), old);
assert.equal(styled.style.rooms.open35_public.lamp, null);
assert.equal(styled.style.rooms.open35_public.rows, null);
assert.deepEqual(styled.style.rooms.open35_public.wall_, []);
assert.equal(styled.viewFar, 96);
assert.ok(styled.atmosphere.density < .025);
for (const kind of ['courtyard', 'concourse', 'reception']) {
  const name = openPlaceStyle35(base, { ...L, open35: { ...L.open35, kind } }).name;
  setLang('en'); assert.equal(t(name), name);
  setLang('tr'); assert.notEqual(t(name), name);
  setLang('ru'); assert.notEqual(t(name), name);
}
setLang('en'); pass('copied sparse style and three translated place names; legacy definitions remain exact');

// Actual ceiling geometry opens onto sky while Rapier retains the enclosed roof cap.
const room = L.rooms.find(r => L.open35.skyRooms.includes(r.id));
assert.ok(room);
const x = L.ox + (room.x + room.w / 2) * L.cell, z = L.oz + (room.z + room.h / 2) * L.cell;
const i = L.idx(room.cx, room.cz), feet = new THREE.Vector3(x, L.y + 1.6, z);
assert.equal(openPlaceCeiling35(L, i), false);
const ordinary = L.rooms.find(r => !L.open35.skyRooms.includes(r.id));
assert.equal(openPlaceCeiling35(L, L.idx(ordinary.cx, ordinary.cz)), true);
assert.equal(openPlaceCeiling35({ ...L, open35: null }, i), true);
scene.updateMatrixWorld(true);
const ray = new THREE.Raycaster(feet, new THREE.Vector3(0, 1, 0), 0, 96);
const upward = ray.intersectObject(fac.group, true);
assert.ok(upward.some(hit => hit.object === sky), 'the first-person upward ray reaches the actual hemisphere');
assert.ok(!upward.some(hit => hit.object.userData.levelKey?.startsWith('c:')), 'the visual roof never hides the skylight');
physics.world.step();
const roof = physics.raycast(feet, { x: 0, y: 1, z: 0 }, 15, G.STATIC);
assert.ok(roof && roof.distance > 4 && roof.distance < 10, 'the native solid roof still encloses the opening');
assert.equal(lights(), initialLights);
assert.equal(sky.material.fog, false); assert.equal(sky.material.depthWrite, false);
assert.equal(sky.material.side, THREE.BackSide); assert.ok('PSX_NOSNAP' in sky.material.defines);
assert.equal(sky.userData.noMerge, true);
assert.ok(!sky.isLight && sky.parent === fac.group);
pass('actual glazed roof, cloud view ray, native roof cap and fixed light count');

// The cloud is a finite map resource, not shared global environment state.
const tex = sky.material.map, pixels = tex.image.data;
assert.equal(tex.image.width, 128); assert.equal(tex.image.height, 128);
assert.equal(tex.magFilter, THREE.NearestFilter); assert.equal(tex.generateMipmaps, false);
const tones = new Set();
for (let p = 0; p < pixels.length; p += 4) {
  assert.equal(pixels[p], pixels[p + 1]); assert.equal(pixels[p], pixels[p + 2]);
  assert.equal(pixels[p + 3], 255); tones.add(pixels[p]);
}
assert.ok(tones.size >= 3 && tones.size <= 8, 'cloud cover varies within a small neutral palette');
assert.ok(sky.geometry.attributes.position.count <= 400);
const hash = data => createHash('sha256').update(data).digest('hex');
const firstHash = hash(pixels), disposed = { geo: 0, mat: 0, tex: 0 };
sky.geometry.addEventListener('dispose', () => disposed.geo++);
sky.material.addEventListener('dispose', () => disposed.mat++);
tex.addEventListener('dispose', () => disposed.tex++);
fac.dispose(physics); fac.dispose(physics);
assert.deepEqual(disposed, { geo: 1, mat: 1, tex: 1 });
assert.equal(fac.group.parent, null); assert.equal(lights(), initialLights);
const again = buildFacility(L, { physics, lightPool }); scene.add(again.group);
const nextSky = again.group.getObjectByName('openplaces35-sky');
assert.notEqual(nextSky.geometry, sky.geometry); assert.notEqual(nextSky.material, sky.material);
assert.notEqual(nextSky.material.map, tex); assert.equal(hash(nextSky.material.map.image.data), firstHash);
assert.deepEqual(disposed, { geo: 1, mat: 1, tex: 1 });
assert.equal(buildOpenPlaceSky35({ layout: L, group: again.group, Y: L.y }), nextSky, 'repeat builder call reuses only the same live map instance');
assert.equal(again.group.children.filter(o => o.name === 'openplaces35-sky').length, 1);
again.dispose(physics); pass('once-only native unload disposal and independent deterministic rebuild resources');

for (const [kind, theme] of [['concourse', 'greenhouse'], ['reception', 'backrooms']]) {
  const layout = generateLayout(0x3537, theme, 1, { open35: kind });
  const facility = buildFacility(layout, { physics, lightPool }); scene.add(facility.group);
  const cloud = facility.group.getObjectByName('openplaces35-sky');
  const central = layout.rooms.find(r => layout.open35.skyRooms.includes(r.id));
  const eye = new THREE.Vector3(layout.ox + (central.x + central.w / 2) * layout.cell, layout.y + 1.6, layout.oz + (central.z + central.h / 2) * layout.cell);
  scene.updateMatrixWorld(true);
  const skyHits = new THREE.Raycaster(eye, new THREE.Vector3(0, 1, 0), 0, 96).intersectObject(facility.group, true);
  assert.ok(skyHits.some(hit => hit.object === cloud), `${kind}: actual ceiling opens onto clouds`);
  assert.ok(!skyHits.some(hit => hit.object.userData.levelKey?.startsWith('c:')), `${kind}: visual ceiling does not hide sky`);
  physics.world.step();
  const cap = physics.raycast(eye, { x: 0, y: 1, z: 0 }, 15, G.STATIC);
  assert.ok(cap?.distance > 4 && cap.distance < 10, `${kind}: the physical cap remains enclosed`);
  assert.equal(lights(), initialLights);
  assert.notEqual(cloud.material.map, tex);
  facility.dispose(physics);
}
pass('native concourse and reception roofs expose their own clouds with enclosed collision');

// Native Backrooms module, with DOM deliberately absent during cosmetic updates.
// This exposes the real fog owner without pretending to render its caption UI.
function atmosphereCase(open, power, darkRoom = false) {
  const layout = generateLayout(0x3536, 'backrooms', 1, open ? { open35: 'reception' } : null);
  const facility = buildFacility(layout, { physics, lightPool });
  const publicRoom = open ? layout.rooms.find(r => layout.open35.publicRooms.includes(r.id)) : layout.rooms.find(r => r.type === 'yellow_room');
  const px = layout.ox + (publicRoom.x + publicRoom.w / 2) * layout.cell;
  const pz = layout.oz + (publicRoom.z + publicRoom.h / 2) * layout.cell;
  if (darkRoom) facility.hazards.breakers.push({ room: publicRoom.id, on: false });
  const mods = new Emitter(), game = {
    world: { facility }, player: { indoor: true, dead: false, pos: new THREE.Vector3(px, layout.y + .1, pz) },
    env: {}, lights: lightPool, mods, run: { seed: 1, daysLeft: 3, quotaIndex: 0 }, audio: null, engine: { fx: {} }, time: 0,
  };
  const doc = globalThis.document; globalThis.document = undefined;
  const errorsBefore = errLog.total;
  let api;
  try {
    lightPool.globalDim = power;
    api = installBackroomsLevels(game);
    for (let n = 0; n < 40; n++) { game.time += .25; mods.emit('update', .25); }
    assert.equal(errLog.total, errorsBefore, 'real cosmetic update callbacks complete without swallowed errors');
    assert.equal(game.player.indoor, true);
    return { fog: api.stats.fog.density, ambient: lightPool.ambient.intensity };
  } finally {
    api?.dispose(); globalThis.document = doc; facility.dispose(physics); lightPool.globalDim = 1;
  }
}
const legacy = atmosphereCase(false, 1), open = atmosphereCase(true, 1);
assert.ok(legacy.fog >= .031 && legacy.fog <= .033, 'legacy Level0 haze remains native');
assert.ok(open.fog < .025, 'lit public reception keeps its admitted long sightline haze');
const powerDark = atmosphereCase(true, 0), breakerDark = atmosphereCase(true, 1, true);
assert.ok(powerDark.fog > .06 && powerDark.ambient < .02, 'native facility power-dark mood is retained');
assert.ok(breakerDark.fog > .06 && breakerDark.ambient < .04, 'a native room breaker stays dark');
assert.equal(lights(), initialLights);
pass('real Backrooms updates keep admitted haze while legacy and power/breaker darkness remain native');
physics.dispose();
console.log(`openplaces35_art: ${passed} PASS groups; native lifecycle and geometry only, no rendered QA`);
console.log(JSON.stringify({ skyDraws: 1, skyTriangles: sky.geometry.index.count / 3, skyVertices: sky.geometry.attributes.position.count, cloudTextureBytes: pixels.byteLength, sceneLightCount: initialLights, ownedDisposals: disposed }));
