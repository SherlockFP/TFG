import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics,G,groups} from '../../src/physics/physics.js';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {ItemManager} from '../../src/entities/items.js';
import {Session} from '../../src/net/session.js';
import {Emitter,errLog} from '../../src/core/events.js';
import {MOONS} from '../../src/game/moons.js';
import {admitOpenPlaces35} from '../../src/game/openplaces35.js';
import {hostMethods} from '../../src/game/host.js';
import {buildDescent21,physicalReach21} from '../../src/world/descent21.js';
const feature=await import('../../src/game/adventure40.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
assert.equal(typeof feature.installAdventure40,'function','normal expedition needs a native abandoned crew encounter');
await initPhysics();window.__kefalMods={itemModels:new Map()};
const initialErrors=errLog.total;
function fixture(seed=35){
 const physics=new Physics(),scene=new THREE.Scene(),fac=buildFacility(generateLayout(seed,'factory',.8,{open35:{version:35,kind:'courtyard'}}),{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);
 const net=new Session({strategy:'local',isHost:true,code:'adventure40'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
 const run={phase:'moon',moon:'hamsi',seed,day:1,quotaIndex:0,exploration38:1};run.openPlaces35=admitOpenPlaces35(run,MOONS.hamsi);
 const mods=new Emitter(),wire=[],players=[];
 const game={isHost:true,selfId:'H',time:0,run,physics,scene,engine:{scene},net,mods,remotes:new Map(),world:{facility:fac,moonId:'hamsi',seed,descent21Depth:0},hostData:{},settings:{},config:{},broadcastRun:hostMethods.broadcastRun,ui:{hud:{toast(){}}},lore:{say(){}},hostSave(){},aiPlayerById:id=>players.find(p=>p.id===id),aiPlayers:()=>players,downed:{isDowned:()=>false},unloadMap(){},onItemHeld(){},onItemDropped(){},onItemImpact(){}};
 game.items=new ItemManager(game);net.on_('it',d=>game.items.onEvent(d));net.on_('gs',d=>wire.push({t:'gs',d:structuredClone(d)}));const broadcast=net.broadcast.bind(net);net.broadcast=(t,d,...rest)=>{if(t==='av40fx')wire.push({t,d:structuredClone(d)});return broadcast(t,d,...rest);};
 const spot=fac.bigSpots.filter(s=>s.dist>=7)[0]||fac.bigSpots[0];assert(spot);
 const id=game.items.hostSpawn('goldbar',new THREE.Vector3(spot.x+.7,spot.y+.55,spot.z-.5),{value:170,baseValue:170});
 for(let n=0;n<3;n++)physics.step(1/60);
 const lift=buildDescent21({facility:fac,physics});assert(lift);game.descent21={plan:()=>lift.plan};physics.world.propagateModifiedBodyPositionsToColliders();
 const api=game.adventure40=feature.installAdventure40(game);hostMethods.registerHandlers.call(game);
 const tick=()=>{game.time+=.25;physics.step(1/60);mods.emit('update',.25,game);};
 const snapshot=()=>({id,type:game.items.get(id).type,value:game.items.get(id).value,baseValue:game.items.get(id).baseValue,p:game.items.get(id).obj.position.toArray(),count:[...game.items.all()].length});
 return{game,api,id,fac,physics,net,mods,wire,players,lift,tick,snapshot,dispose(){api.dispose();lift.dispose();game.items.clearAll();game.items.dispose();fac.dispose(physics);assert.equal(physics.info.size,0);physics.dispose();net.transport.leave();net.clear();}};
}
for(const seed of [35,1235]){
 const f=fixture(seed);try{
  const before=f.snapshot(),resources=f.physics.info.size;assert(f.api.offer(f.id));f.tick();const s=f.api.scene();assert(s,'existing valuable admits accessible authored scene');assert(s.path.length>1);assert.equal(s.id,f.id);assert.deepEqual(f.snapshot(),before,'same native stock pose, identity and economy');assert.equal(f.api.offer(f.id),false,'one offer per token');
  const p={id:'H',pos:new THREE.Vector3(...s.approach),eye:new THREE.Vector3(s.approach[0],s.approach[1]+1.62,s.approach[2]),zone:'in',dead:false,inShip:false,heldItem:()=>null,slots:[]};f.players.push(p);f.game.player=p;
  f.net.request('av40req',{token:s.token,id:s.id});assert.equal(f.game.run.adventure40.heard,true,'real Session request earns one team recording');
  const count=f.wire.filter(x=>x.t==='av40fx').length;f.net.request('av40req',{token:s.token,id:s.id});assert.equal(f.wire.filter(x=>x.t==='av40fx').length,count,'replay cannot repeat team reveal');
  p.pos.fromArray(s.cargoApproach);f.net.request('pick',{id:f.id,slot:0});assert.equal(f.game.items.get(f.id).holder,'H','native host pickup self-delivers real custody');p.inShip=true;f.tick();assert.equal(f.game.run.adventure40.returned,true,'same-ID native holder aboard earns recognition');f.tick();assert.equal(f.wire.filter(x=>x.t==='av40fx').length,count+1);
  f.mods.emit('facilityWillChange',f.game.world,f.game,1);assert.equal(f.physics.info.size,resources-1,'scene removes owned collider before surface disposal');assert.equal(f.api.scene(),null);f.game.world.descent21Depth=1;f.tick();assert.equal(f.api.scene(),null);
  f.game.world.descent21Depth=0;f.mods.emit('facilityChanged',f.game.world,f.game,0);f.tick();assert(f.api.scene(),'surface return restores presentation');assert(f.game.run.adventure40.heard&&f.game.run.adventure40.returned);f.api.dispose();assert.equal(f.physics.info.size,resources-1);f.api.dispose();
  console.log('PASS adventure40 native scene, Session playback, unchanged cargo and lifecycle',seed);
 }finally{f.dispose();}
}
{
 const f=fixture();try{f.api.offer(f.id);f.tick();const s=f.api.scene();const p={id:'H',pos:new THREE.Vector3(...s.approach),eye:new THREE.Vector3(s.approach[0],s.approach[1]+1.62,s.approach[2]),zone:'in',dead:false,heldItem:()=>null,slots:[]};f.players.push(p);f.game.player=p;
  for(const change of [()=>p.dead=true,()=>p.pos.y+=5,()=>p.pos.x+=20]){const pos=p.pos.clone();change();f.net.request('av40req',{token:s.token,id:s.id});assert(!f.game.run.adventure40.heard);p.dead=false;p.pos.copy(pos);}
  f.net.handlers.get('av40req')({token:s.token,id:s.id},'unknown');assert(!f.game.run.adventure40.heard);
  f.net.request('av40req',{token:s.token+'stale',id:s.id});assert(!f.game.run.adventure40.heard);
  const block=f.physics.addStaticBox(p.eye.x,p.eye.y,p.eye.z,.4,.4,.4);f.physics.step(1/60);f.net.request('av40req',{token:s.token,id:s.id});assert(!f.game.run.adventure40.heard,'static LOS blocker rejects actual request');f.physics.removeCollider(block);
  console.log('PASS adventure40 current known living floor/range/LOS request guards');
 }finally{f.dispose();}
}
for(const mutate of [g=>g.isHost=false,g=>g.run.mode='endless',g=>g.run.phase='orbit',g=>delete g.run.exploration38,g=>g.world.descent21Depth=1,g=>g.world.seed++]){
 const f=fixture();try{const before=f.snapshot();mutate(f.game);assert(!f.api.offer(f.id));f.tick();assert.equal(f.api.scene(),null);assert.deepEqual(f.snapshot(),before);}finally{f.dispose();}
}
console.log('PASS adventure40 off-scope fallback retains native stock');




// Native controller walks from entrance to recorder, then the unchanged cargo.
{
 const f=fixture();let p;try{
  f.api.offer(f.id);f.tick();const s=f.api.scene();f.game.engine.camera=new THREE.PerspectiveCamera();f.game.camera=f.game.engine.camera;p=f.game.player=new LocalPlayer(f.game);p.id='H';p.zone='in';p.indoor=true;p.inShip=false;f.players.push(p);p.teleport(f.fac.mainDoor.spawn,f.fac.mainDoor.faceYaw);
  function step(dx,dz){p.ctrl.computeColliderMovement(p.col,{x:dx,y:p.grounded?0:-.02,z:dz},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const m=p.ctrl.computedMovement(),b=p.body.translation();p.body.setNextKinematicTranslation({x:b.x+m.x,y:b.y+m.y,z:b.z+m.z});f.physics.step(1/60);const next=p.body.translation();p.pos.set(next.x,next.y-p.half-.34,next.z);p.grounded=p.ctrl.computedGrounded();}
  function walk(target){let frames=0;while(Math.hypot(p.pos.x-target[0],p.pos.z-target[2])>.09&&frames++<1800){const dx=target[0]-p.pos.x,dz=target[2]-p.pos.z,len=Math.hypot(dx,dz),speed=Math.min(.075,len);step(dx/len*speed,dz/len*speed);assert(Math.abs(p.pos.y-f.fac.layout.y)<.08,'actual controller remains on native floor');}assert(frames<1800,'controller reaches certified target without teleport or wall bypass');}
  for(let i=0;i<12;i++)step(0,0);for(const target of s.path)walk(target);
  f.net.request('av40req',{token:s.token,id:s.id});assert(f.game.run.adventure40.heard,'native walked standing approach earns playback');
  walk(s.path.at(-2));const reach=physicalReach21(f.fac,f.physics);const cargoPath=reach.pathTo(s.cargoApproach[0],s.cargoApproach[2]);for(const target of cargoPath)walk([target.x,target.y,target.z]);
  f.net.request('pick',{id:f.id,slot:0});assert.equal(f.game.items.get(f.id).holder,'H');assert.equal(f.game.items.get(f.id).value,170);
  console.log('PASS adventure40 actual native entrance/recording/cargo controller walk');
 }finally{if(p){f.physics.world.removeCharacterController(p.ctrl);f.physics.removeBody(p.body);}f.dispose();}
}
{
 const f=fixture();try{f.api.offer(f.id);f.tick();const s=f.api.scene(),p={id:'P',pos:new THREE.Vector3(...s.approach),zone:'in',dead:false,inShip:false};f.players.push(p);f.net.players.set('P',{id:'P'});f.net.transport.peers.add('P');
  f.net.lost.set('P',{t:0});f.net.receive({t:'req',d:{a:'av40req',token:s.token,id:s.id}},'P');assert(!f.game.run.adventure40.heard);f.net.lost.delete('P');
  let reentries=0;const gs=f.net.msgHandlers.get('gs');f.net.on_('gs',d=>{gs(d);if(d.adventure40?.heard){reentries++;f.net.receive({t:'req',d:{a:'av40req',token:s.token,id:s.id}},'P');}});
  f.net.receive({t:'req',d:{a:'av40req',token:s.token,id:s.id}},'P');assert(f.game.run.adventure40.heard);assert.equal(reentries,1);assert.equal(f.wire.filter(x=>x.t==='av40fx').length,1,'receipt closes before synchronous gs re-entry');
  f.api.dispose();const saved=structuredClone(f.game.run.adventure40);f.game.run.adventure40=saved;const restored=f.game.adventure40=feature.installAdventure40(f.game);try{hostMethods.registerHandlers.call(f.game);f.game.isHost=f.net.isHost=false;f.tick();assert(restored.scene(),'client rebuild reads synchronized receipt');f.game.isHost=f.net.isHost=true;f.mods.emit('hostMigrated',f.game,{self:true});f.tick();assert(!restored.offer(f.id));assert.deepEqual(f.game.run.adventure40,saved);assert.equal([...f.game.items.all()].length,1);}finally{restored.dispose();}
  assert(!f.net.msgHandlers.has('av40fx'),'dispose removes the actual Session message callback');console.log('PASS adventure40 real connected peer, lost-link rejection, synchronous re-entry and host promotion');
 }finally{f.dispose();}
}
{
 const f=fixture();try{const before=f.snapshot(),resources=f.physics.info.size;for(const s of f.fac.scrapSpots){const c=f.physics.addStaticBox(s.x,f.fac.layout.y+.9,s.z,1.7,.9,1.7);f.fac.colliders.push(c);}f.physics.step(1/60);f.api.offer(f.id);f.tick();assert.equal(f.api.scene(),null,'blocked cargo approach safely skips scene');assert.deepEqual(f.snapshot(),before);assert(!f.game.run.adventure40);assert(f.physics.info.size>resources);console.log('PASS adventure40 physical blocked-site fallback preserves original stock');}finally{f.dispose();}
}
assert.equal(errLog.total,initialErrors,'no swallowed native module errors');
