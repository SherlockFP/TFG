import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initPhysics, Physics, G, groups } from '../../src/physics/physics.js';
import { CreatureManager } from '../../src/entities/creatures.js';
import { installEscape14 } from '../../src/game/escape14.js';
import { bodyRoute, bodySegment, coverOccluded } from '../../src/game/escape17.js';
await initPhysics();
const canvas=()=>({width:64,height:64,style:{},getContext:()=>new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:10}):(k==='createImageData'||k==='getImageData')?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true})});
const oldDocument=globalThis.document;globalThis.document={createElement:()=>canvas()};
const { generateLayout, buildFacility }=await import('../../src/world/facility.js');
const summaries=[];
for(const[seed,size]of [[1235,.8],[1235,1],[1235,1.5],[42,.8],[777,1.2]]){
 const physics=new Physics(),scene=new THREE.Scene(),layout=generateLayout(seed,'factory',size),fac=buildFacility(layout,{physics,lightPool:{add:e=>e,remove:()=>{}}});scene.add(fac.group);
 const events=new Map(),handlers=new Map(),messages=[];let hits=0;
 const me={id:'p',pos:new THREE.Vector3(0,-300,0),eye:new THREE.Vector3(0,-298.38,0),zone:'in',dead:false,inShip:false,voice:0};
 const game={isHost:true,selfId:'p',scene,engine:{scene},world:{moonId:'hamsi',seed,facility:fac},run:{phase:'moon',quotaIndex:2,day:1,cargo13:{}},physics,player:{dead:false,frozen:false,downed:false},items:{all:()=>[].values()},mods:{creatureModels:new Map(),itemModels:new Map(),on:(k,f)=>{const a=events.get(k)||[];events.set(k,a);a.push(f);return()=>a.splice(a.indexOf(f),1);}},net:{msgHandlers:new Map(),on_(k,f){this.msgHandlers.set(k,f);},broadcast:(k,d)=>messages.push({k,d:structuredClone(d)}),sendTo:(id,k,d)=>messages.push({id,k,d:structuredClone(d)}),sendRows:()=>{}},broadcastRun:()=>{},aiPlayers:()=>[me],aiPlayerById:id=>id===me.id?me:null,downed:{isDowned:()=>false},unloadMap:()=>{},hostHurtPlayer:()=>hits++,hostSetDoor:(id,open)=>{const d=fac.doors.find(d=>d.id===id);if(d){d.open=open;if(open&&d.collider){physics.removeCollider(d.collider);d.collider=null;}}}};
 game.creatures=new CreatureManager(game);const api=installEscape14(game);game.escape14=api;
 const coldWork=[];let measuring=true;const emit=(k,...args)=>{for(const f of events.get(k)||[]){const started=performance.now();f(...args);if(measuring&&k==='update')coldWork.push(performance.now()-started);}};emit('registerHandlers',(k,f)=>handlers.set(k,f));
 const counts={rays:0,capsules:0,los:0,paths:0};
 for(const[obj,k,counter]of [[physics,'raycast','rays'],[physics,'lineOfSight','los'],[physics.world,'castShape','capsules'],[physics.world,'intersectionsWithShape','capsules'],[fac.nav,'findPath','paths']]){const orig=obj[k];obj[k]=function(...args){counts[counter]++;return orig.apply(this,args);};}
 const began=performance.now();emit('mapLoaded',game.world);assert.equal(api.shelters().length,0,'defer real geometry until Rapier queries ready');
 for(let i=0;i<180;i++){physics.step(1/60);emit('update',1/60);}
 const planningMs=performance.now()-began,coldCounts={...counts},work=coldWork.slice().sort((a,b)=>a-b),planningUpdate={maxMs:+Math.max(...work).toFixed(3),medianMs:+work[Math.floor(work.length/2)].toFixed(3),totalMs:+work.reduce((a,b)=>a+b,0).toFixed(3)},routes=api.routes();measuring=false;assert(api.shelters().length>=2,`seed${seed}/size${size} usable physical shelters`);assert(routes.length,`seed${seed}/size${size} at least one meaningful escape plan`);
 const first=routes[0],points=first.points.map(p=>new THREE.Vector3(...p)),spawn=new THREE.Vector3(...first.spawn),cover=new THREE.Vector3(...first.cover);
 assert(bodyRoute(game,points),'actual capsule traverses full marked route');assert(coverOccluded(game,spawn,cover),'actual panel/wall breaks initial sight');
 // Copies are read-only from the caller's perspective.
 routes[0].points[0][0]+=100;assert.notEqual(api.routes()[0].points[0][0],routes[0].points[0][0]);
 const markerRoot=scene.getObjectByName('escape14-screening').children.find(o=>o.isGroup),marker=markerRoot.children[0];assert.equal(markerRoot.children.length,1,'one static batched mesh for all floor chevrons');assert(marker.geometry.attributes.position.count>=6,'multiple fixed floor cues in the batch');
 let disposed=0;marker.geometry.addEventListener('dispose',()=>disposed++);game.net.msgHandlers.get('e14state')(structuredClone(game.run.escape14),'host');
 assert.equal(markerRoot.children[0],marker);assert.equal(scene.getObjectByName('escape17-route-marks'),marker,'same-state replication reuses exact route mesh/geometry');assert.equal(disposed,0,'same-state replication never disposes static route geometry');
 me.pos.fromArray(first.start);me.eye.copy(me.pos).add(new THREE.Vector3(0,1.62,0));
 const {body,col}=physics.createKinematicCapsule({x:me.pos.x,y:me.pos.y+.92,z:me.pos.z},.56,.34,G.PLAYER,G.STATIC|G.DOOR);game.player.body=body;game.player.col=col;const ctrl=physics.createController();physics.step(1/60);
 const step=()=>{game.time=(game.time||0)+1/60;physics.step(1/60);game.creatures.hostUpdate(1/60);emit('update',1/60);};
 handlers.get('e14act')({op:'start'},'p');assert.equal(game.run.escape14.result,'active','native authenticated activation accepts planned route');
 const c=game.creatures.host.get(game.run.escape14.warden);assert(game.creatures.canSee(c,me,24,360));for(let i=0;i<60;i++)step();assert(c.data.hadSight,'actual native warning sees player');
 for(const goal of points.slice(1)){
  let n=0;while(me.pos.distanceTo(goal)>.06&&n++<120){
   const dx=goal.x-me.pos.x,dz=goal.z-me.pos.z,d=Math.hypot(dx,dz),scale=Math.min(d,8.2/60)/d;
   ctrl.computeColliderMovement(col,{x:dx*scale,y:0,z:dz*scale},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const mv=ctrl.computedMovement(),t=body.translation(),np={x:t.x+mv.x,y:t.y+mv.y,z:t.z+mv.z};body.setNextKinematicTranslation(np);body.setTranslation(np,true);physics.world.propagateModifiedBodyPositionsToColliders?.();me.pos.set(np.x,np.y-.92,np.z);me.eye.copy(me.pos).add(new THREE.Vector3(0,1.62,0));step();
  }
  assert(me.pos.distanceTo(goal)<.08,'actual Rapier character controller walks each planned point without teleport');
 }
 assert(!game.creatures.canSee(c,me,24,360),'physically walked cover actually breaks native sight');
 for(let i=0;i<1800&&game.run.escape14.result==='active';i++)step();
 assert.equal(game.run.escape14.result,'escaped','genuine native seen pursuit + physically navigated route finishes unseen search');assert.equal(hits,0);assert(!game.creatures.host.has(c.id));assert(messages.some(m=>m.k==='cev'&&m.d.e==='rm'&&m.d.id===c.id));
 summaries.push({seed,size,shelters:api.shelters().length,routes:api.routes().length,planningMs:+planningMs.toFixed(2),planningUpdate,coldCounts,totalCounts:{...counts},result:game.run.escape14.result});
 api.dispose();physics.removeBody(body);fac.dispose(physics);physics.world.free();
}
globalThis.document=oldDocument;
console.log('escape17: real multi-seed/size placement, capsule route cues, native authenticated pursuit and actual KCC walking PASS',JSON.stringify(summaries));
