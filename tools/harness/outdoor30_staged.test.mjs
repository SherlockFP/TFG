// Native outdoor geometry/Rapier/LightPool and real LandingQueue ownership.
// Canvas is the existing recording fixture; no renderer or asset preload.
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildMoonOutdoor, createOutdoorBuild30, queueOutdoorBuild30, Terrain } from '../../src/world/terrain.js';
import { MOONS } from '../../src/game/moons.js';
import { LandingQueue } from '../../src/game/landingq.js';
import { initPhysics, Physics } from '../../src/physics/physics.js';
import { LightPool } from '../../src/render/lightpool.js';
await initPhysics();
const hash = a => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const v = value => value?.toArray?.() ?? value;
const select = (value, keys) => keys.map(k => v(value?.[k]));
function snapshot(out, ph) {
  const meshes = []; out.group.updateMatrixWorld(true);
  out.group.traverse(o => {
    if (!o.isMesh) return; // Existing visual-only Points particles use Math.random.
    const g = o.geometry;
    meshes.push([o.name, o.matrixWorld.toArray(), Object.entries(g.attributes).map(([k,a]) => [k,a.itemSize,hash(a.array)]),
      g.index ? hash(g.index.array) : null, o.instanceMatrix ? hash(o.instanceMatrix.array) : null,
      o.instanceColor ? hash(o.instanceColor.array) : null,
      [].concat(o.material).map(m => [m.type,m.name,m.color?.toArray(),m.emissive?.toArray(),m.map?.name,m.vertexColors,m.transparent,m.opacity,m.side])]);
  });
  const cols = [];
  for (const [handle, info] of ph.info) {
    const c = ph.world.getCollider(handle), shape = c.shape;
    cols.push([c.translation(),c.rotation(),c.collisionGroups(),shape.type,shape.halfExtents,shape.radius,shape.halfHeight,
      shape.vertices ? hash(shape.vertices) : null, shape.indices ? hash(shape.indices) : null, select(info,['kind','id','hid'])]);
  }
  const harvest = kind => out.harvest[kind].map(p => select(p,['id','kind','x','y','z','rot','scale','variant','colliders']));
  const queries = [];
  for (let x=-90;x<=90;x+=30) for (let z=-90;z<=90;z+=30) queries.push([out.avoid(x,z,1),out.solidAt(x,z,1),out.terrain.heightAt(x,z)]);
  return { meshes, cols, heights:hash(out.terrain.heights),path:out.terrain.pathPts,reach:out.terrain.reach ? hash(out.terrain.reach) : null,
    entrance:out.mainExit,fire:out.fireExits,interactables:out.interactables.map(p=>select(p,['type','index','pos','r'])),
    ponds:out.ponds.map(p=>select(p,['x','y','z','r'])),scrap:out.outdoorScrapSpots,
    emitters:out.emitters.map(p=>select(p,['pos','color','intensity','distance','group','flicker','blink'])),
    trees:harvest('trees'),rocks:harvest('rocks'),queries,
    outposts:out.outposts?.sites.map(p=>select(p,['kind','name','x','y','z','rot','radius'])),
    outpostScrap:out.outposts?.scrapSpots,crates:out.outposts?.crates.map(p=>select(p,['id','x','y','z','rotY','locked','open'])) };
}
const cases = [
  ['hamsi',660949389,false], ['lufer',17,false], ['hamsi',42,true],
];
// Generated from frozen HEAD terrain/geobuilder, not this shared generator.
// Terrain source SHA256: 8e2f1570b83cfd4d20e04b9fb63cbd4f0729675e92860531e06195eb91771ca7.
const GOLDEN = [
  '6a935019a6fde094e627bbc03cd832cae8e919735c4bcaabf27d1662eb3a2359',
  'fbda038b31e2dd8f6f7e39926bad9c82c262cfc5ab68bfb5f06efebdf0ce75ef',
  'a7c1e0ff2349ea949c7f0c70e388d0373d7cd3875645cc026e6aa752183fb80a',
];
function context() { return { physics:new Physics(), lightPool:new LightPool(new THREE.Scene()) }; }
function release(out,c) {
  out?.dispose(c.physics); out?.dispose(c.physics);
  assert.equal(c.physics.info.size,0); assert.equal(c.lightPool.emitters.size,0); c.physics.world.free();
}
for (const [index,[id,seed,merge]] of cases.entries()) {
  globalThis.__kefalOutMerge = merge;
  const instant=context(), out=buildMoonOutdoor(seed,MOONS[id],instant), expected=snapshot(out,instant.physics);
  assert.equal(digest(expected),GOLDEN[index],id+' geometry, material, native collider, height, spawn and placement frozen-HEAD oracle');
  release(out,instant);
  const c=context(), q=new LandingQueue({startDelay:0}), events=[];let result=null,build=null,ticks=0;
  q.add('outdoor',()=>{build=queueOutdoorBuild30(seed,MOONS[id],c,q,ready=>{result=ready;events.push('ready');});q.addNext('sibling',()=>events.push('sibling'));});
  for (const name of ['layout','facility','mapLoaded','phase','prewarm']) q.add(name,()=>{assert.ok(result,name+' sees completed outdoor');events.push(name);});
  while(q.pending) {
    const start=q.last.length; q.tick(.1); assert.ok(++ticks<500);
    assert.ok(q.last.slice(start).filter(j=>j.name.startsWith('outdoor:')).length<=1,'one yieldFrame continuation per pump');
    if (!build?.done) assert.equal(result,null,'no partial outdoor publication');
  }
  assert.deepEqual(events,['ready','sibling','layout','facility','mapLoaded','phase','prewarm']);
  assert.deepEqual(snapshot(result,c.physics),expected,'exact shared sync/queued native output equality');
  assert.equal(q.clearCleanups.size,0);const chunks=q.last.filter(j=>j.name.startsWith('outdoor:'));
  assert.ok(chunks.length>1);q.clear();assert.ok(c.physics.info.size>0,'published output remains owned by normal map unload');
  console.log('outdoor30 staged',id,JSON.stringify({merge,ticks,units:build.units,chunks:chunks.length,maxChunkMs:Math.max(...chunks.map(j=>j.ms))}));
  release(result,c);
}
globalThis.__kefalOutMerge=false;
// Capture the real partial terrain group through the production ownership callback.
const original=Terrain.prototype.buildMeshSteps30;let detached=null;
Terrain.prototype.buildMeshSteps30=function*(ownGroup){return yield* original.call(this,g=>{ownGroup?.(g);detached=g.parent;});};
try {
  // Cancel while only one native material/geometry bucket exists; no repeated release.
  const c=context(), build=createOutdoorBuild30(660949389,MOONS.hamsi,c);let step;
  do{step=build.advance(0);}while(!step.done&&step.value!=='terrain-mesh-ground');
  assert.equal(step.done,false);assert.ok(detached);assert.equal(detached.parent,null);
  const disposed=new Map();detached.traverse(o=>{if(o.geometry){disposed.set(o.geometry,0);o.geometry.addEventListener('dispose',()=>disposed.set(o.geometry,disposed.get(o.geometry)+1));}});
  assert.ok(disposed.size>0);build.cancel();build.cancel();assert.equal(build.cancelled,true);assert.equal(build.advance().value,null);
  for(const n of disposed.values())assert.equal(n,1,'partial terrain bucket disposed once');
  assert.equal(c.physics.info.size,0);assert.equal(c.lightPool.emitters.size,0);c.physics.world.free();
} finally {Terrain.prototype.buildMeshSteps30=original;}
// Real queued unload after collider creation; later native map hooks cannot run.
{
  const c=context(),q=new LandingQueue({startDelay:0,now:(()=>{let n=0;return()=>++n*10;})()});let build=null,ready=0,hooks=0,warm=0;
  q.afterPrewarm.push(()=>warm++);q.add('outdoor',()=>build=queueOutdoorBuild30(660949389,MOONS.hamsi,c,q,()=>ready++));q.add('mapLoaded',()=>hooks++);
  while(!c.physics.info.size){q.tick(.1);assert.equal(ready,0);}
  assert.equal(build.done,false);assert.ok(q.pending);assert.equal(q.clearCleanups.size,1);
  q.clear();q.clear();q.flush();assert.equal(build.cancelled,true);assert.equal(ready,0);assert.equal(hooks,0);assert.equal(warm,1);
  assert.equal(q.clearCleanups.size,0);assert.equal(c.physics.info.size,0);assert.equal(c.lightPool.emitters.size,0);c.physics.world.free();
}
// Late cancellation owns outpost lights and broadcast colliders before publication.
{
  const c=context();let group=null;const meshSteps=Terrain.prototype.buildMeshSteps30;
  Terrain.prototype.buildMeshSteps30=function*(own){return yield* meshSteps.call(this,g=>{own?.(g);group=g.parent;});};
  const build=createOutdoorBuild30(660949389,MOONS.hamsi,c);let step;
  try{do{step=build.advance(0);}while(!step.done&&step.value!=='broadcast');}
  finally{Terrain.prototype.buildMeshSteps30=meshSteps;}
  assert.equal(step.done,false);assert.ok(group);
  const geometryEvents=new Map();group.traverse(o=>{if(o.geometry&&!geometryEvents.has(o.geometry)){geometryEvents.set(o.geometry,0);o.geometry.addEventListener('dispose',()=>geometryEvents.set(o.geometry,geometryEvents.get(o.geometry)+1));}});
  assert.ok(c.physics.info.size>0);assert.ok(c.lightPool.emitters.size>0,'real outpost emitters precede final publication');
  let removed=0;const remove=c.lightPool.remove;c.lightPool.remove=function(...args){removed++;return remove.apply(this,args);};
  const count=c.lightPool.emitters.size;build.cancel();const afterFirst=[...geometryEvents.values()];
  assert.ok(afterFirst.some(n=>n>0),'actual attached sub-owner buffers released');
  build.cancel();assert.deepEqual([...geometryEvents.values()],afterFirst,'second cancel never re-enters attached native sub-owners');
  assert.equal(removed,count,'tracked emitters removed once');
  assert.equal(c.physics.info.size,0);assert.equal(c.lightPool.emitters.size,0);c.physics.world.free();
}
// Native phase flush still completes descendants and preserves synchronous callers.
{
  const c=context(),q=new LandingQueue({startDelay:0}),events=[];let result=null;
  q.add('outdoor',()=>queueOutdoorBuild30(42,MOONS.hamsi,c,q,out=>{result=out;events.push('ready');}));q.add('mapLoaded',()=>{assert.ok(result);events.push('mapLoaded');});
  assert.ok(q.flush()>1);assert.deepEqual(events,['ready','mapLoaded']);assert.equal(q.pending,0);release(result,c);
  const instant=context();let value=null;assert.equal(queueOutdoorBuild30(42,MOONS.hamsi,instant,q,out=>value=out),null);assert.ok(value);release(value,instant);
}
// Fault in the native entrance collider path releases the existing terrain collider.
for(const queued of [false,true]) {
  const c=context();let calls=0,ready=0,hooks=0;const add=c.physics.addStaticBox;
  c.physics.addStaticBox=function(...args){if(++calls===3)throw Error('outdoor-native-fault30');return add.apply(this,args);};
  if(!queued)assert.throws(()=>buildMoonOutdoor(42,MOONS.hamsi,c),/outdoor-native-fault30/);
  else {const q=new LandingQueue({startDelay:0}),warn=console.warn;console.warn=()=>{};try{q.add('outdoor',()=>queueOutdoorBuild30(42,MOONS.hamsi,c,q,()=>ready++));q.add('mapLoaded',()=>hooks++);q.flush();assert.equal(q.pending,0);assert.equal(q.clearCleanups.size,0);}finally{console.warn=warn;}assert.equal(ready,0);assert.equal(hooks,0);}
  assert.equal(c.physics.info.size,0);assert.equal(c.lightPool.emitters.size,0);c.physics.world.free();
}
console.log('outdoor30 frozen-HEAD oracle / queue / cancel / flush / fault PASS');
