// NATIVE_INTEGRATION: seeded facility, native item bounds, Rapier and Session.
// Initial map/items/player are labelled setup; this is not blind exploration.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics,G,RAPIER,groups} from '../../src/physics/physics.js';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {ItemManager} from '../../src/entities/items.js';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {admitOpenPlaces35} from '../../src/game/openplaces35.js';
import {MOONS} from '../../src/game/moons.js';
import {hostMethods} from '../../src/game/host.js';
import {RNG} from '../../src/core/rng.js';
import {buildDescent21,physicalReach21} from '../../src/world/descent21.js';
const feature=await import('../../src/game/salvage39.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const planSalvage39=feature.planSalvage39||(()=>null),relocateSalvage39=feature.relocateSalvage39||(()=>null);
await initPhysics();window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};window.KefalAPI={THREE};

function fixture(seed=35,{moon='hamsi',fresh=true}={}){
 const physics=new Physics(),scene=new THREE.Scene(),kind=moon==='lufer'?'concourse':'courtyard',theme=moon==='lufer'?'greenhouse':'factory',size=MOONS[moon]?.size||.8;
 const fac=buildFacility(generateLayout(seed,theme,size,{open35:{version:35,kind}}),{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);
 const net=new Session({strategy:'local',isHost:true,code:'salvage39'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
 const run={runId:'salvage39',phase:'moon',moon,seed,day:1,quotaIndex:0,quota:330,time:480,daysLeft:3,weather:'clear',exploration38:fresh?1:undefined};run.openPlaces35=admitOpenPlaces35(run,MOONS[moon]);
 const camera=new THREE.PerspectiveCamera(),wire=[],game={physics,scene,camera,engine:{camera,scene},isHost:true,selfId:'H',run,world:{facility:fac,moonId:moon,seed,descent21Depth:0},mods:new Emitter(),net,time:0,
  config:{inventorySlots:4},hostData:{},settings:{},stats:{speedMul:1,maxHp:100,maxStamina:100,staminaRegen:16},ui:{toast(){}},onItemHeld(){},onItemDropped(){},onItemImpact(){},
  broadcastRun:hostMethods.broadcastRun,hostSpawnWave(){},hostEarlySafeFilter:()=>null,creatures:{hostSpawn(){}},deadletter24:{active:()=>false}};
 game.items=new ItemManager(game);game.player=new LocalPlayer(game);game.player.teleport(fac.mainDoor.spawn,fac.mainDoor.faceYaw);
 net.on_('it',d=>{wire.push(structuredClone(d));game.items.onEvent(d);});net.on_('gs',d=>wire.push({e:'gs',...structuredClone(d)}));
 for(let n=0;n<3;n++)physics.step(1/60);
 const ids=[],sourceSpots=fac.scrapSpots.filter(s=>fac.layout.open35.publicRooms.includes(s.room)).sort((a,b)=>Math.hypot(a.x-fac.mainDoor.spawn.x,a.z-fac.mainDoor.spawn.z)-Math.hypot(b.x-fac.mainDoor.spawn.x,b.z-fac.mainDoor.spawn.z)).slice(0,3);
 function spawnSetup(){for(const [i,type]of ['goldbar','duck','bolt'].entries())ids.push(game.items.hostSpawn(type,new THREE.Vector3(sourceSpots[i].x,sourceSpots[i].y+.5,sourceSpots[i].z),{value:[140,10,24][i],baseValue:[140,10,24][i]}));physics.step(1/60);return ids;}
 let lift=null;
 return{game,fac,physics,net,wire,ids,sourceSpots,spawnSetup,buildLift(){assert(!lift);physics.world.propagateModifiedBodyPositionsToColliders();lift=buildDescent21({facility:fac,physics});assert(lift,'native final surface lift admits');physics.world.propagateModifiedBodyPositionsToColliders();return lift;},dispose(){lift?.dispose();game.items.clearAll();game.items.dispose();physics.world.removeCharacterController(game.player.ctrl);physics.removeBody(game.player.body);fac.dispose(physics);assert.equal(physics.info.size,0);physics.dispose();net.transport.leave();net.clear();}};
}
const snapshot=it=>({id:it.id,type:it.type,value:it.value,baseValue:it.baseValue,tier:it.tier,holder:it.holder,owner:it.owner,p:it.obj.position.toArray(),q:it.obj.quaternion.toArray(),body:it.body});
function frame(f,desired){const p=f.game.player;p.ctrl.computeColliderMovement(p.col,desired,undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const m=p.ctrl.computedMovement(),b=p.body.translation();p.body.setNextKinematicTranslation({x:b.x+m.x,y:b.y+m.y,z:b.z+m.z});f.physics.step(1/60);const next=p.body.translation();p.pos.set(next.x,next.y-p.half-.34,next.z);p.grounded=p.ctrl.computedGrounded();}
function walk(f,target){const p=f.game.player;let frames=0;while(Math.hypot(p.pos.x-target[0],p.pos.z-target[2])>.09&&frames++<1500){const dx=target[0]-p.pos.x,dz=target[2]-p.pos.z,len=Math.hypot(dx,dz),speed=Math.min(.08,len);frame(f,{x:dx/len*speed,y:p.grounded?0:-.02,z:dz/len*speed});assert(Math.abs(p.pos.y-f.fac.layout.y)<.08,'native walk remains on the actual floor');}assert(frames<1500,'native capsule reaches the branch without injected positions');}
function finalAccess(f,plan){
 const L=f.fac.layout,P=f.physics,it=f.game.items.get(plan.id),approach={x:plan.approach[0],y:L.y,z:plan.approach[2]},reach=physicalReach21(f.fac,P),path=reach.pathTo(approach.x,approach.z);
 assert(path,'final lift/static geometry retains a physical route to the admitted valuable');
 const capsule=new RAPIER.Capsule(.56,.36),size=it.size,drop=new RAPIER.Cuboid(Math.max(.05,size.x/2)+.03,Math.max(.05,size.y/2)+.03,Math.max(.05,size.z/2)+.03),mask=groups(0xffff,G.STATIC|G.DOOR|G.ITEM|G.BIG);
 let blocked=false;P.world.intersectionsWithShape(it.body.translation(),it.obj.quaternion,drop,()=>{blocked=true;return false;},undefined,mask,it.col,it.body);assert(!blocked,'final lift walls and remaining population cannot intersect the actual valuable bounds');
 blocked=false;P.world.intersectionsWithShape({x:approach.x,y:L.y+.94,z:approach.z},{x:0,y:0,z:0,w:1},capsule,()=>{blocked=true;return false;},undefined,mask);assert(!blocked,'final contents preserve the standing pickup approach');
 for(let n=0;n<12;n++)frame(f,{x:0,y:-.02,z:0});walk(f,[f.fac.mainDoor.spawn.x,L.y,f.fac.mainDoor.spawn.z]);for(const target of path)walk(f,[target.x,L.y,target.z]);
 const floor=P.raycast({x:f.game.player.pos.x,y:f.game.player.pos.y+.3,z:f.game.player.pos.z},{x:0,y:-1,z:0},.65,G.STATIC|G.DOOR);
 assert(floor&&floor.normal.y>.8&&Math.abs(floor.point.y-L.y)<.05,'final standing approach rests on its native floor');
 const eye={x:f.game.player.pos.x,y:f.game.player.pos.y+1.62,z:f.game.player.pos.z},point=it.body.translation(),delta={x:point.x-eye.x,y:point.y-eye.y,z:point.z-eye.z},distance=Math.hypot(delta.x,delta.y,delta.z);
 assert(distance<2.7,'final native controller walk reaches ordinary pickup range');assert.equal(P.raycast(eye,{x:delta.x/distance,y:delta.y/distance,z:delta.z/distance},distance-.1,G.STATIC|G.DOOR),null,'final lift/population preserves ordinary pickup LOS');
 return path.length;
}

for(const [seed,moon]of [[35,'hamsi'],[1235,'hamsi'],[413,'lufer']]){
 const f=fixture(seed,{moon});try{
  f.spawnSetup();const before=f.ids.map(id=>snapshot(f.game.items.get(id))),resources={colliders:f.physics.info.size,emitters:f.fac.emitters.length,children:f.fac.group.children.length},plan=planSalvage39(f.game,f.ids,f.sourceSpots);
  assert(plan,'one already-rolled valuable must admit a physically reachable optional signed bay');
  assert.equal(plan.id,f.ids[0]);assert(f.fac.layout.open35.bayRooms.includes(plan.room));assert.equal(plan.path.at(-1)[0],plan.approach[0]);assert(Object.isFrozen(plan)&&Object.isFrozen(plan.path),'planning receipt is immutable');
  assert(!f.fac.fireDoors.some(d=>f.fac.layout.roomOf[d.info.a]===plan.room),'a return exit cannot become the optional deadend');
  assert(plan.landmark.title.en&&plan.detour>=4,'existing physical landmark and an actual bay detour identify the choice');
  assert.deepEqual(f.ids.map(id=>snapshot(f.game.items.get(id))),before,'planning does not mutate native items');
  const moved=relocateSalvage39(f.game,f.ids,f.sourceSpots);assert.equal(moved.id,plan.id);assert.deepEqual(moved.p,plan.p);assert.deepEqual(f.game.run.salvage39.id,plan.id);
  const item=f.game.items.get(plan.id),after=snapshot(item);assert.deepEqual({...after,p:before[0].p},before[0],'one native identity retains economy, custody, rotation and body');
  assert.deepEqual(f.ids.slice(1).map(id=>snapshot(f.game.items.get(id))),before.slice(1),'cheap original alternatives remain at their original positions');
  assert.equal(f.wire.filter(d=>d.e==='tp').length,1);assert.equal(relocateSalvage39(f.game,f.ids,f.sourceSpots),null,'same native population receipt cannot reposition again');
  assert.deepEqual({colliders:f.physics.info.size,emitters:f.fac.emitters.length,children:f.fac.group.children.length},resources,'no added lights, geometry or colliders');
  const lift=f.buildLift(),finalPath=finalAccess(f,plan);
  console.log('PASS salvage39 native final branch',JSON.stringify({seed,moon,room:plan.room,landmark:plan.landmark.title.en,length:plan.length,detour:plan.detour,liftRoom:lift.plan.roomId,finalPath}));
 }finally{f.dispose();}
}

for(const mutate of [g=>delete g.run.exploration38,g=>g.isHost=false,g=>g.run.phase='orbit',g=>g.world.seed++,g=>g.world.descent21Depth=1,g=>g.run.moon='hq',g=>delete g.run.openPlaces35,g=>g.world.facility.group.getObjectByName('openplaces36-landmarks').removeFromParent()]){
 const f=fixture();try{f.spawnSetup();const before=f.ids.map(id=>snapshot(f.game.items.get(id)));mutate(f.game);assert.equal(relocateSalvage39(f.game,f.ids,f.sourceSpots),null);assert.deepEqual(f.ids.map(id=>snapshot(f.game.items.get(id))),before);assert(!f.game.run.salvage39);}finally{f.dispose();}
}
console.log('PASS salvage39 preserves old/peer/stale/special/deep/unmarked contexts');

{
 const f=fixture();try{f.spawnSetup();for(const room of f.fac.layout.open35.bayRooms){const r=f.fac.layout.rooms[room];f.physics.addStaticBox(f.fac.layout.ox+(r.x+r.w/2)*4,-298.5,f.fac.layout.oz+(r.z+r.h/2)*4,r.w*2-.05,1.45,r.h*2-.05);}f.physics.step(1/60);const before=f.ids.map(id=>snapshot(f.game.items.get(id)));assert.equal(relocateSalvage39(f.game,f.ids,f.sourceSpots),null,'actual blocked bays retain ordinary placement');assert.deepEqual(f.ids.map(id=>snapshot(f.game.items.get(id))),before);for(const col of [...f.physics.info.keys()]){const c=f.physics.world.getCollider(col);if(c&&!f.fac.colliders.includes(c)&&f.physics.infoOf(c)?.kind==='static')f.physics.removeCollider(c);}}finally{f.dispose();}
}
console.log('PASS salvage39 rejects native blocked detours');

{
 const f=fixture();try{
  f.spawnSetup();const original=f.net.msgHandlers.get('it'),gs=f.net.msgHandlers.get('gs');let attempts=0;
  f.net.on_('it',d=>{original(d);if(d.e==='tp'){attempts++;assert(f.game.run.salvage39);assert.equal(relocateSalvage39(f.game,f.ids,f.sourceSpots),null);}});
  f.net.on_('gs',d=>{gs(d);if(d.salvage39){attempts++;assert.equal(relocateSalvage39(f.game,f.ids,f.sourceSpots),null);}});
  const plan=relocateSalvage39(f.game,f.ids,f.sourceSpots);assert(plan);assert.equal(attempts,2);assert.equal(f.wire.filter(d=>d.e==='tp').length,1);
 }finally{f.dispose();}
}
console.log('PASS salvage39 receipt reserves once before real Session item/run self-delivery');

for(const change of [it=>it.value=80,it=>it.holder='P',it=>it.owner='P',it=>it.collected=true,it=>it.def={...it.def,special:'apparatus'},it=>it.def={...it.def,fragile:.5},it=>it.type='fj_legacy']){
 const f=fixture();try{f.spawnSetup();change(f.game.items.get(f.ids[0]));const before=f.ids.map(id=>snapshot(f.game.items.get(id)));assert.equal(relocateSalvage39(f.game,f.ids,f.sourceSpots),null);assert.deepEqual(f.ids.map(id=>snapshot(f.game.items.get(id))),before);}finally{f.dispose();}
}
console.log('PASS salvage39 refuses cheap/held/owned/collected/apparatus/fragile/legacy valuables');

function population(f){
 const raw=Math.random,rng=new RNG('same original native salvage39 population draws'),draws=[];
 Math.random=()=>{if(!new Error().stack.split('\n')[2].includes('ItemManager.hostSpawn'))return raw();const v=rng.next();draws.push(v);return v;};
 try{hostMethods.hostPopulateMoon.call(f.game);}finally{Math.random=raw;}
 return{rows:f.wire.filter(d=>d.e==='sp'),draws};
}
let offered=0;
for(const [seed,moon]of [[35,'hamsi'],[1235,'hamsi'],[17,'hamsi'],[413,'lufer']]){
 const control=fixture(seed,{moon,fresh:false}),fresh=fixture(seed,{moon});try{
  const before=population(control),after=population(fresh);
  assert.deepEqual(after.draws,before.draws,'all original value, ID and yaw entropy draws remain exact');assert.deepEqual(after.rows,before.rows,'all original spawn messages preserve type, IDs, value, tier, count and original poses');
  const id=fresh.game.run.salvage39?.id,moves=fresh.wire.filter(d=>d.e==='tp');assert.equal(moves.length,id?1:0);offered+=Number(!!id);
  for(const original of control.game.items.all()){
   const changed=fresh.game.items.get(original.id),a=snapshot(original),b=snapshot(changed);delete a.body;delete b.body;if(original.id===id)b.p=a.p;assert.deepEqual(b,a,'only the admitted native valuable pose may differ');
  }
  control.buildLift();const lift=fresh.buildLift(),finalPath=id?finalAccess(fresh,fresh.game.run.salvage39):null;
  console.log('population salvage39',JSON.stringify({seed,moon,items:after.rows.length,offered:!!id,liftRoom:lift.plan.roomId,finalPath}));
 }finally{control.dispose();fresh.dispose();}
}
assert(offered>0,'at least one bounded real native population has an eligible detour');
console.log('PASS salvage39 paired original population entropy/economy/count/custody and stock fallback');
