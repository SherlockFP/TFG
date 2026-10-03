// NATIVE_INTEGRATION: actual seeded facility/Rapier/controller/cabin/item dimensions.
// Map, initial player stance and item spawn are setup fixtures, not blind-human play.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics,G,RAPIER,groups} from '../../src/physics/physics.js';
import {generateLayout,buildFacility,createFacilityBuild30} from '../../src/world/facility.js';
import {buildDescent21} from '../../src/world/descent21.js';
import {facilityReach} from '../../src/world/interiors/facsys.js';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {ItemManager} from '../../src/entities/items.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {RNG} from '../../src/core/rng.js';
import {installSalvage27} from '../../src/game/salvage27.js';
import {installEarlyHaul34} from '../../src/game/earlyhaul34.js';
import {planDressing} from '../../src/game/worlds3_core.js';
import {planFacility as planHorror} from '../../src/game/horror_core.js';
await initPhysics();
window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};window.KefalAPI={THREE};
const hash=body=>createHash('sha256').update(body).digest('hex');
const layoutBody=L=>JSON.stringify([L.rooms,L.cells,L.roomOf,L.heightOf,[...L.open],[...L.edgeInfo],L.distOf,L.variety,L.m2]);
const goldens=[
 [35,'factory',.8,null,'a4b7a5c7e7f6fe12712c144ae9e69e00dccaf79e1bf6cdc24d293398d50d15d4'],
 [413,'greenhouse',1,null,'771b3b2f022288d9c94c86a082bae44f21b85d42505e232bc57b85f3e2f94802'],
 [771,'backrooms',.9,null,'d7e092f0d84ac02800e58893bc8957c9cdd497b14f88020b8c538d3b64f22510'],
 [913,'factory',1,{arch:'atrium'},'351814909f51fce659f60f3ecb7cb57ffec9125455932e099af5d4b6d978aa4c'],
];
for(const [seed,theme,size,opts,want] of goldens)assert.equal(hash(layoutBody(generateLayout(seed,theme,size,opts))),want,'non-admitted legacy generation remains exact');
for(const request of ['unknown',{version:34,kind:'courtyard'},{version:35,kind:'concourse'}])assert.equal(generateLayout(35,'factory',.8,{open35:request}).open35,undefined,'foreign/old opt-in cannot alter native map');
assert.equal(generateLayout(35,'factory',.8,{open35:'courtyard',arena:true}).open35,undefined,'authored encounter layout retains owner');
const cases=[['courtyard','factory',35,.8],['concourse','greenhouse',413,1],['reception','backrooms',771,.9]];
function snapshot(fac,physics){
 const mesh=[];fac.group.updateMatrixWorld(true);fac.group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;mesh.push([o.name,o.matrixWorld.toArray(),Object.entries(g.attributes).map(([k,a])=>[k,hash(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))]),g.index?hash(new Uint8Array(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength)):null]);});
 return{mesh,walk:[...fac.nav.walk],locks:[...fac.nav.blockedEdges],cols:fac.colliders.map(c=>[c.translation(),c.rotation(),c.shape.type,physics.infoOf(c)?.kind]),scrap:fac.scrapSpots,big:fac.bigSpots,doors:fac.doors.map(d=>[d.id,d.kind,d.pos.toArray(),d.locked]),emitters:fac.emitters.map(e=>[e.pos.toArray(),e.color,e.intensity,e.group]),viewFar:fac.viewFar};
}
function makeGame(physics,fac,seed){
 const net=new Session({strategy:'local',isHost:true,code:'open35'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
 const camera=new THREE.PerspectiveCamera(),scene=new THREE.Scene();scene.add(fac.group);const game={physics,camera,scene,engine:{camera,scene},isHost:true,selfId:'H',time:0,
 run:{runId:'world35',moon:'hamsi',phase:'moon',seed,day:1,quotaIndex:0,quota:330,time:480},config:{inventorySlots:4},hostData:{powerUsed:0},world:{facility:fac,moonId:'hamsi',seed,descent21Depth:0},
 mods:new Emitter(),net,ui:{toast(){}},stats:{speedMul:1,maxHp:100,maxStamina:100,staminaRegen:16},settings:{},items:null,player:null,broadcastRun(){}};
 game.items=new ItemManager(game);game.player=new LocalPlayer(game);net.on_('it',d=>game.items.onEvent(d));return game;
}
function controllerFrame(game,desired){
 const p=game.player;p.ctrl.computeColliderMovement(p.col,desired,undefined,groups(G.PLAYER,G.STATIC|G.DOOR));
 const m=p.ctrl.computedMovement(),b=p.body.translation();p.body.setNextKinematicTranslation({x:b.x+m.x,y:b.y+m.y,z:b.z+m.z});game.physics.world.step();
 const next=p.body.translation();p.pos.set(next.x,next.y-p.half-.34,next.z);p.grounded=p.ctrl.computedGrounded();
}
function settleController(game){
 // Native exterior-door entry intentionally starts 10 cm above the floor; land through the controller.
 for(let frame=0;frame<12;frame++)controllerFrame(game,{x:0,y:-.02,z:0});
 assert(game.player.grounded&&Math.abs(game.player.pos.y-game.world.facility.layout.y)<.03,`actual entry capsule lands on its native floor before traversal ${JSON.stringify({pos:game.player.pos.toArray(),grounded:game.player.grounded})}`);
}
function moveController(game,target){
 const p=game.player;let frames=0;
 while(Math.hypot(p.pos.x-target.x,p.pos.z-target.z)>.07&&frames++<2500){
  const dx=target.x-p.pos.x,dz=target.z-p.pos.z,len=Math.hypot(dx,dz),step=Math.min(.08,len);
  controllerFrame(game,{x:dx/len*step,y:p.grounded?0:-.02,z:dz/len*step});
  assert(Math.abs(p.pos.y-game.world.facility.layout.y)<.08,`actual controller stays on native floor/threshold ${JSON.stringify({pos:p.pos.toArray(),target,frames})}`);
 }assert(frames<2500,'real controller reaches target without traversal position injection');return frames;
}
for(const [kind,theme,seed,size] of cases){
 for(const testSize of [.5,size,2.6])for(const testSeed of [seed,seed+1]){
  const opts={arch:'catacomb',open35:{version:35,kind}},L=generateLayout(testSeed,theme,testSize,opts);
  assert.equal(L.open35?.version,35,'admitted normal facility builds an authored broad place');assert.equal(L.open35.kind,kind);
  assert.equal(L.theme,theme);assert.equal(L.mazes.length,0);assert.equal(L.variety,null);assert.equal(L.m2,null);
  assert.equal(layoutBody(L),layoutBody(generateLayout(testSeed,theme,testSize,opts)),'shared seeded generation repeats');
  assert.equal(planDressing(L,new RNG((L.seed^0x3d55a1)>>>0)).length,0,'registered worlds3 mapLoaded dressing cannot repopulate public floor');
  const horror=planHorror(L,{day:1,quotaIndex:0});assert.equal(horror.traps.length,0,'registered horror finds no narrow trap run');
  assert(horror.closets.every(c=>c.room!==L.open35.skyRooms[0]),'optional wall closets cannot occupy central public floor');
  const reach=facilityReach(L,{sources:[L.idx(L.entrance.room.cx,L.entrance.room.cz)]});
  for(let i=0;i<L.cells.length;i++)if(L.cells[i]&&!['core','vault'].includes(L.rooms[L.roomOf[i]].type))assert(reach[i],'main entrance reaches every ordinary authored cell with locks retained');
  assert(opts.arch==='catacomb'&&opts.open35.kind===kind,'input options untouched');
 }
 const physics=new Physics(),layout=generateLayout(seed,theme,size,{open35:{version:35,kind}}),started=performance.now();
 const fac=buildFacility(layout,{physics,lightPool:{add:e=>e,remove(){}}}),buildMs=+(performance.now()-started).toFixed(2),expected=snapshot(fac,physics),game=makeGame(physics,fac,seed);let lift=null,salvage=null,early=null;
 let meshes=0,triangles=0;fac.group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 try{
  for(let frame=0;frame<3;frame++)physics.step(1/60);const L=fac.layout,C=L.cell,central=L.rooms[L.open35.skyRooms[0]],center={x:L.ox+(central.x+central.w/2)*C,z:L.oz+(central.z+central.h/2)*C};
  assert.equal(fac.viewFar,96);assert(fac.group.getObjectByName('openplaces35-sky'));assert(fac.scrapSpots.length>=20&&fac.bigSpots.length>=5,'native salvage population receives real floor candidates');assert(fac.sys.gen&&fac.sys.core,'native generator and containment remain installed');
  const length=(central.h-1)*C,from={x:center.x,y:L.y+1.6,z:L.oz+(central.z+.5)*C};
  assert(length>=32);assert.equal(physics.raycast(from,{x:0,y:0,z:1},length,G.STATIC|G.DOOR),null,'long actual standing sightline has no maze/furniture/frame');
  const roof=physics.raycast({x:center.x,y:L.y+1.6,z:center.z},{x:0,y:1,z:0},10,G.STATIC);assert(roof&&Math.abs(roof.point.y-(L.y+central.height))<.05,'glazed visual opening retains native solid roof');
  const north=L.rooms.find(r=>r.open35Role==='north'),perimeter=physics.raycast({x:L.ox+(north.x+.5)*C,y:L.y+1.6,z:L.oz+(north.z+.5)*C},{x:0,y:0,z:-1},3,G.STATIC);assert(perimeter,'real native perimeter blocks leaving authored floor');
  game.player.teleport(fac.mainDoor.spawn,fac.mainDoor.faceYaw);physics.world.step();settleController(game);
  moveController(game,{x:fac.mainDoor.spawn.x,z:center.z});moveController(game,{x:center.x,z:center.z});
  if(kind==='courtyard'){
   salvage=installSalvage27(game);game.earlyHaul34=early=installEarlyHaul34(game);const offer=early.populationOffer(fac.bigSpots,1);assert(offer,'native early Indexed Glass placement admits courtyard');
   const plan=early.plan();assert(plan.length<=40&&plan.path.length>2);assert.equal(plan.doors.length,0,'early route uses broad public frontage');
   const id=game.items.hostSpawn('vase',new THREE.Vector3(...plan.p),{earlyHaul34:offer}),item=game.items.get(id);assert.equal(item.type,'indexedglass27');
   physics.step(1/60);const size=item.obj.userData.size,shape=new RAPIER.Cuboid(size.x/2+.03,size.y/2,size.z/2+.03);
   const a={x:center.x,y:L.y+size.y/2+.1,z:center.z-8},velocity={x:0,y:0,z:16};
   assert.equal(physics.world.castShape(a,{x:0,y:0,z:0,w:1},velocity,shape,.01,1,true,undefined,groups(0xffff,G.STATIC|G.DOOR)),null,'actual registered big-item dimensions sweep across broad cargo lane');
   const approach=new THREE.Vector3(...plan.approach),target=new THREE.Vector3(...plan.p),aim=target.clone().sub(approach.clone().add(new THREE.Vector3(0,1.5,0))),distance=aim.length();
   assert(distance<3.2);assert.equal(physics.raycast({x:approach.x,y:approach.y+1.5,z:approach.z},aim.normalize(),distance-.05,G.STATIC|G.DOOR),null,'early item remains in native pickup range/LOS');
  }
  lift=buildDescent21({facility:fac,physics,floor:kind==='reception'?3:0});assert(lift,'actual certified native lift fits broad plan');physics.world.step();assert(lift.plan.entryPath.length>1&&lift.plan.routeProof.version===23);assert(lift.plan.discoveryRooms.length>=5&&lift.plan.discoveryRooms.length<15,'native lift discovers actual finite rooms');
  for(const spawn of lift.plan.safeSpawns){let blocked=false;physics.world.intersectionsWithShape({x:spawn.x,y:spawn.y+.94,z:spawn.z},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.56,.34),()=>{blocked=true;return false;},undefined,groups(0xffff,G.STATIC));assert.equal(blocked,false,'four real capsule spawn footprints fit cabin');}
  moveController(game,{x:fac.mainDoor.spawn.x,z:center.z});moveController(game,fac.mainDoor.spawn);
  for(const target of [...lift.plan.entryPath.slice(1),...lift.plan.approachPath.slice(1)])moveController(game,target);
  const source=game.player.pos,anchor=lift.plan.call,dir={x:anchor.x-source.x,y:anchor.y-(source.y+1.4),z:anchor.z-source.z},dist=Math.hypot(dir.x,dir.y,dir.z);assert(dist<2.4);assert.equal(physics.raycast({x:source.x,y:source.y+1.4,z:source.z},{x:dir.x/dist,y:dir.y/dist,z:dir.z/dist},dist-.18,G.STATIC|G.DOOR),null,'walked native call range/LOS preserved');
  console.log('native open35',JSON.stringify({kind,seed,rooms:L.rooms.length,publicRooms:L.open35.publicRooms.length,sightline:length,colliders:fac.colliders.length,emitters:fac.emitters.length,meshes,triangles,buildMs,acceptanceMs:+(performance.now()-started).toFixed(2),liftDiscovery:lift.plan.discoveryRooms.length}));
 }finally{early?.dispose();salvage?.dispose();lift?.dispose();game.items.clearAll();game.items.dispose();physics.world.removeCharacterController(game.player.ctrl);physics.removeBody(game.player.body);fac.dispose(physics);assert.equal(physics.info.size,0);physics.dispose();game.net.transport.leave();game.net.clear();}
 const stagedPhysics=new Physics(),build=createFacilityBuild30(generateLayout(seed,theme,size,{open35:{version:35,kind}}),{physics:stagedPhysics,lightPool:{add:e=>e,remove(){}}});let steps=0,result;
 while(!build.done){const step=build.advance(0);steps++;if(step.done)result=step.value;assert(steps<3000);}
 assert.deepEqual(snapshot(result,stagedPhysics),expected,'instant/staged actual geometry/collision/nav/spawn equality');result.dispose(stagedPhysics);assert.equal(stagedPhysics.info.size,0);stagedPhysics.dispose();console.log('staged open35',kind,steps,'micro-units');
}
const partialPhysics=new Physics(),partial=createFacilityBuild30(generateLayout(35,'factory',.8,{open35:{version:35,kind:'courtyard'}}),{physics:partialPhysics,lightPool:{add:e=>e,remove(){}}});partial.advance(0);assert(partialPhysics.info.size>0);partial.cancel();partial.cancel();assert.equal(partialPhysics.info.size,0);partialPhysics.dispose();
console.log('openplaces35_world: PASS legacy goldens,18 authored layouts,3 actual native maps/controller/lift/staged,cargo/early-haul and cancellation');
