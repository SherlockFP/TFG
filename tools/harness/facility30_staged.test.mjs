import './ship2_env.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {generateLayout,buildFacility,createFacilityBuild30,queueFacilityBuild30} from '../../src/world/facility.js';
import {GeoBuilder} from '../../src/world/geobuilder.js';
import {LandingQueue} from '../../src/game/landingq.js';
import {initPhysics,Physics} from '../../src/physics/physics.js';
import {LightPool} from '../../src/render/lightpool.js';
await initPhysics();
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function snapshot(fac,ph){
 const meshes=[];fac.group.updateMatrixWorld(true);fac.group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;meshes.push([o.name,o.matrixWorld.toArray(),Object.entries(g.attributes).map(([k,a])=>[k,a.itemSize,hash(a.array)]),g.index?hash(g.index.array):null,o.instanceMatrix?hash(o.instanceMatrix.array):null,[].concat(o.material).map(m=>[m.type,m.name,m.color?.toArray(),m.map?.name,m.vertexColors,m.transparent,m.side])]);});
 const clean=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['obj','mesh','group','collider','anchors'].includes(k)));
 return {meshes,walk:hash(fac.nav.walk),locks:[...fac.nav.blockedEdges],doors:fac.doors.map(d=>[d.id,d.kind,{...d.info},d.pos.toArray(),d.rotY,d.locked,d.open,d.colArgs,d.solidArgs]),cols:fac.colliders.map(c=>[c.translation(),c.rotation(),c.collisionGroups(),c.shape.type,c.halfExtents?.(),ph.infoOf(c)?.kind,ph.infoOf(c)?.id]),scrap:fac.scrapSpots.map(clean),big:fac.bigSpots.map(clean),vault:fac.vaultSpots.map(clean),vents:fac.ventSpots.map(clean),mines:fac.mineSpots.map(clean),turrets:fac.turretSpots.map(clean),wall:fac.wallSpots.map(clean),ceiling:fac.ceilingSpots.map(clean),emitters:fac.emitters.map(e=>[e.pos.toArray(),e.color,e.intensity,e.distance,e.group,e.flicker]),chests:fac.chestSpots.map(clean),landmarks:fac.landmarkSpots.map(clean),interior:fac.interior};
}
function nativeContext(){return {physics:new Physics(),lightPool:new LightPool(new THREE.Scene())};}
function release(fac,c){fac?.dispose(c.physics);assert.equal(c.physics.info.size,0);assert.equal(c.lightPool.emitters.size,0);c.physics.world.free();}

const cases=[['factory',699464887,.68,{arch:'atrium',roomMul:1.05}],['backrooms',17,.9],['threadarchive',42,1.1]];
for(const [theme,seed,size,opts] of cases){
 const instant=nativeContext(),fac=buildFacility(generateLayout(seed,theme,size,opts),instant),expected=snapshot(fac,instant.physics);release(fac,instant);
 const context=nativeContext(),q=new LandingQueue({startDelay:0}),events=[];let result=null,build=null,ticks=0;
 q.add('facility',()=>{build=queueFacilityBuild30(generateLayout(seed,theme,size,opts),context,q,ready=>{result=ready;events.push('ready');});q.addNext('sibling',()=>events.push('sibling'));});
 q.add('mapLoaded',()=>{assert.ok(result,'mapLoaded sees full facility');events.push('mapLoaded');});q.add('phase',()=>events.push('phase'));q.add('prewarm',()=>events.push('prewarm'));
 while(q.pending){const before=q.last.length;q.tick(.1);ticks++;assert.ok(ticks<500);const chunks=q.last.slice(before).filter(j=>j.name.startsWith('facility:'));assert.ok(chunks.length<=1,'yieldFrame permits one actual build continuation per pump');if(!build?.done)assert.equal(result,null,'no partial facility published');}
 assert.deepEqual(events,['ready','sibling','mapLoaded','phase','prewarm'],'addNext descendants finish before sibling/later hooks');assert.deepEqual(snapshot(result,context.physics),expected,theme+' exact geometry/nav/native collider/door/spawn equality');assert.equal(q.clearCleanups.size,0,'completed build unregisters cancellation');
 const chunks=q.last.filter(j=>j.name.startsWith('facility:'));assert.ok(chunks.length>1,'actual heavy construction crosses multiple pumps');assert.ok(build.units>chunks.length,'micro-units remain budgeted inside chunks');
 q.clear();assert.ok(context.physics.info.size>0,'clear does not dispose a completed published facility');console.log('facility30 staged',theme,JSON.stringify({ticks,chunks:chunks.length,units:build.units,maxChunkMs:Math.max(...chunks.map(j=>j.ms))}));release(result,context);
}
// Mid-build map unload drops queued callbacks and owns all partial native colliders.
{
 const context=nativeContext(),q=new LandingQueue({startDelay:0});let ready=0,warmClean=0,build=null;
 q.afterPrewarm.push(()=>warmClean++);q.add('facility',()=>{build=queueFacilityBuild30(generateLayout(17,'factory',.8),context,q,()=>ready++);});q.add('mapLoaded',()=>ready++);
 q.tick(.1);assert.ok(context.physics.info.size>0);assert.equal(ready,0);assert.equal(build.done,false);assert.ok(q.pending>0);assert.equal(q.clearCleanups.size,1);
 q.clear();q.clear();q.flush();assert.equal(build.cancelled,true);assert.equal(context.physics.info.size,0);assert.equal(context.lightPool.emitters.size,0);assert.equal(ready,0);assert.equal(warmClean,1,'native prewarm clear cleanup preserved once');assert.equal(q.clearCleanups.size,0);context.physics.world.free();
}
// Cancel after real lights and the first merged geometry exist; observe ownership only.
{
 const context=nativeContext(),original=GeoBuilder.prototype.buildSteps30;let group=null;
 GeoBuilder.prototype.buildSteps30=function*(materialFor,ownGroup){return yield* original.call(this,materialFor,ownGroup?g=>{ownGroup(g);group=g.parent;}:null);};
 let build;try{build=createFacilityBuild30(generateLayout(17,'factory',.8),context);let step;do{step=build.advance(0);}while(!step.done&&step.value!=='merge-bucket');assert.equal(step.done,false);assert.ok(context.lightPool.emitters.size>0);assert.ok(group);
 const owned=new Map();group.traverse(o=>{if(o.userData?.merged&&o.geometry){owned.set(o.geometry,0);o.geometry.addEventListener('dispose',()=>owned.set(o.geometry,owned.get(o.geometry)+1));}});assert.ok(owned.size>0,'a real partially merged detached output exists');
 build.cancel();build.cancel();assert.equal(context.physics.info.size,0);assert.equal(context.lightPool.emitters.size,0);for(const count of owned.values())assert.equal(count,1,'each completed merge output released once');assert.equal(build.advance().value,null,'cancelled builder cannot publish');}
 finally{GeoBuilder.prototype.buildSteps30=original;build?.cancel();context.physics.world.free();}
}
// Required native flush still finishes all descendant jobs synchronously.
{
 const context=nativeContext(),q=new LandingQueue({startDelay:0}),events=[];let result=null;
 q.add('facility',()=>queueFacilityBuild30(generateLayout(42,'factory',.8),context,q,fac=>{result=fac;events.push('ready');}));q.add('mapLoaded',()=>{assert.ok(result);events.push('mapLoaded');});q.tick(.1);assert.equal(result,null);assert.ok(q.pending);assert.ok(q.flush()>1);assert.deepEqual(events,['ready','mapLoaded']);assert.equal(q.pending,0);release(result,context);
}
// Instant and staged exceptions release already-created native resources; no hook sees partial output.
for(const queued of [false,true]){
 const context=nativeContext(),original=context.physics.addStaticBox;let created=0,ready=0,hooks=0;
 context.physics.addStaticBox=function(...args){if(++created===30)throw Error('native-build-fault30');return original.apply(this,args);};
 if(!queued)assert.throws(()=>buildFacility(generateLayout(17,'factory',.8),context),/native-build-fault30/);
 else{const q=new LandingQueue({startDelay:0}),warn=console.warn;console.warn=()=>{};try{q.add('facility',()=>queueFacilityBuild30(generateLayout(17,'factory',.8),context,q,()=>ready++));q.add('mapLoaded',()=>hooks++);q.flush();assert.equal(q.pending,0);assert.equal(q.clearCleanups.size,0);}finally{console.warn=warn;}assert.equal(ready,0);assert.equal(hooks,0);}
 assert.equal(context.physics.info.size,0,'native partial failure collider cleanup');assert.equal(context.lightPool.emitters.size,0);context.physics.world.free();
}
// Outside a running job, native addNext/queued build remains an instant operation.
{
 const context=nativeContext(),q=new LandingQueue({startDelay:0});let result=null;
 assert.equal(queueFacilityBuild30(generateLayout(42,'factory',.5),context,q,fac=>result=fac),null);assert.ok(result);assert.equal(q.pending,0);release(result,context);
}
console.log('facility30 staged native geometry/queue/cancel/flush/error PASS');
