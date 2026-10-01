// NATIVE_INTEGRATION: real seeded facilities, Rapier controller, ItemManager,
// Session self-delivery + two serializing in-process transports. Initial floor,
// ordinary opened doors and native floor-loot placement are labelled fixtures.
// This is neither browser keyboard input, blind discovery nor Internet evidence.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Emitter,errLog} from '../../src/core/events.js';
import {Physics,initPhysics,G,groups} from '../../src/physics/physics.js';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {buildDescent21} from '../../src/world/descent21.js';
import {ItemManager} from '../../src/entities/items.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {Session} from '../../src/net/session.js';
import {hostMethods} from '../../src/game/host.js';
import {newDescent,stageRequest} from '../../src/game/descent21_state.js';
import {floorSpec} from '../../src/game/descent21_core.js';
import {MOONS} from '../../src/game/moons.js';
import {RNG} from '../../src/core/rng.js';
import {tIn} from '../../src/core/i18n.js';
import {installRecovery27,recoveryKey27,planRecovery27,RECOVERY27} from '../../src/game/recovery27.js';
import {RECOVERY27_TEXT} from '../../src/game/recovery27_text.js';
import {makeRecovery27} from '../../src/models/recovery27.js';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {actionMethods}=await import('../../src/game/actions.js');

await initPhysics();window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};window.KefalAPI={THREE};
const errorsBefore=errLog.total;
function fixture(depth=2,{theme=null,seed=null,size=null,loot=16}={}){
 const spec=floorSpec(MOONS.hamsi,17,depth);if(theme)spec.theme=theme;if(seed!=null)spec.seed=seed;
 if(size!=null)spec.size=size;
 const physics=new Physics(),scene=new THREE.Scene(),lights={add:e=>e,remove(){}};
 const fac=buildFacility(generateLayout(spec.seed,spec.theme,spec.size),{physics,lightPool:lights});scene.add(fac.group);physics.world.step();
 const lift=buildDescent21({facility:fac,physics,floor:depth});assert(lift,'native depth cabin fixture exists');physics.world.step();
 const run={runId:'recovery-native',phase:'moon',moon:'hamsi',seed:17,day:1,credits:75,quotaIndex:0,quota:130,sold:0,time:480,daysLeft:3};run.descent21=newDescent(run);Object.assign(run.descent21,{depth,reached:depth,currentChoice:{seed:spec.seed,theme:spec.theme,size:spec.size}});
 const peers=[],toasts=[],wire=[];
 const net=new Session({strategy:'local',isHost:true,code:'RECOVERY27',profile:{}});net.selfId='H';net.hostId='H';net.connected=true;
 // Transport bytes are represented by structuredClone; Session dispatch and
 // host-authoritative item handlers themselves remain the native implementations.
 net.transport.send=(m,to)=>{wire.push({m:structuredClone(m),to});};
 const player={id:'H',pos:new THREE.Vector3(lift.plan.approach.x,fac.layout.y+.03,lift.plan.approach.z),eye:new THREE.Vector3(),look:new THREE.Vector3(0,0,-1),dead:false,zone:'in',indoor:true,inShip:false,slots:[null,null,null,null],heldItem:()=>null};peers.push(player);
 const game={isHost:true,selfId:'H',run,time:0,physics,scene,engine:{scene},world:{facility:fac,moonId:'hamsi',seed:17,descent21Depth:depth},lights,mods:new Emitter(),net,player,camera:new THREE.PerspectiveCamera(),remotes:new Map(),config:{},profile:{},ui:{toast:(...a)=>toasts.push(a),hud:{}},balance:{onNoise(){}},downed:{isDowned:()=>false},ship:{points:{}},aiPlayers:()=>peers,aiPlayerById:id=>peers.find(p=>p.id===id),onItemHeld:actionMethods.onItemHeld,onItemDropped:actionMethods.onItemDropped,refreshHeldVisuals(){},refreshRemoteHeld(){},onItemImpact(){},onItemValueLost(){},broadcastRun:hostMethods.broadcastRun,findInteraction:actionMethods.findInteraction,interactablesNow:actionMethods.interactablesNow,doorInteraction:actionMethods.doorInteraction,unloadMap(){game.world.facility=null;},descent21:{plan:()=>lift.plan,controlsActive:()=>false}};
 game.creatures=new CreatureManager(game);game.items=new ItemManager(game);net.on_('it',d=>game.items.onEvent(d));net.on_('gs',d=>Object.assign(run,d));
 // Native existing floor loot only. No recovery claim or progress is injected.
 const rng=new RNG(spec.seed^0x5eed),spots=rng.shuffle(fac.scrapSpots.slice());
 for(const [i,p]of spots.slice(0,loot).entries())game.items.hostSpawn('bolt',new THREE.Vector3(p.x,p.y+.15,p.z),{value:30+i,tier:'common',yaw:0});
 for(let i=0;i<12;i++){physics.step(1/60);game.items.update(1/60);}
 const original=game.items.serialize();const api=installRecovery27(game);game.recovery27=api;game.mods.emit('registerHandlers',(k,f)=>net.handle(k,f),game);
 const tick=dt=>{game.time+=dt;physics.step(dt);game.items.update(dt);game.mods.emit('update',dt,game);};
 const aim=op=>{const p=api.plan();player.pos.fromArray(p.approach);player.pos.y+=.03;player.eye.copy(player.pos).add(new THREE.Vector3(0,1.5,0));player.look.set(...p[op]).sub(player.eye).normalize();game.camera.position.copy(player.eye);game.camera.lookAt(new THREE.Vector3(...p[op]));};
 const request=op=>{const s=api.state();return{op,key:s.key,epoch:s.epoch,rev:s.rev,nonce:s.nonce};};
 return{game,api,physics,fac,lift,net,original,toasts,wire,tick,aim,request,dispose(){api.dispose();game.items.dispose();game.items.clearAll();game.creatures.clearAll();lift.dispose();fac.dispose(physics);physics.world.free();net.leave();}};
}
function openOrdinaryDoors(f){
 // Same explicit native ordinary-door-open prerequisite as descent21.test.
 // Locked/special doors remain physical blockers and excluded route edges.
 for(const id of f.api.plan().doors){const d=f.fac.doors.find(d=>d.id===id);assert(d&&d.kind==='door'&&!d.locked&&!d.info.code);f.fac.nav.blockedEdges.delete(d.info.key);if(d.collider){f.physics.removeCollider(d.collider);f.fac.colliders.splice(f.fac.colliders.indexOf(d.collider),1);d.collider=null;}d.open=true;d.t=1;}
 f.physics.world.step();
}
function walk(f,path){
 const p=path[0],actor=f.physics.createKinematicCapsule(new THREE.Vector3(p.x,p.y+.94,p.z),.56,.36,G.PLAYER,G.STATIC|G.DOOR),cc=f.physics.createController(.02);cc.enableAutostep(.2,.3,true);f.physics.world.step();
 try{for(const target of path.slice(1)){
  for(let k=0;k<500;k++){const p=actor.body.translation(),dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.08)break;const q=Math.min(.09,d)/d;cc.computeColliderMovement(actor.col,{x:dx*q,y:-.012,z:dz*q},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const move=cc.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+move.x,y:p.y+move.y,z:p.z+move.z});f.physics.world.step();}
  const pos=actor.body.translation();assert(Math.hypot(pos.x-target.x,pos.z-target.z)<.15,`native standing route blocked at ${JSON.stringify(target)} actual=${JSON.stringify(pos)}`);
 }}finally{f.physics.world.removeCharacterController(cc);f.physics.removeBody(actor.body);}
}
const facts=[];
for(const scenario of [{depth:2},{depth:4},{depth:6},{depth:2,size:floorSpec({...MOONS.hamsi,size:.68},17,2).size}]){
 const {depth,size}=scenario,f=fixture(depth,{size});
 try{
  f.game.mods.emit('mapLoaded',f.game.world,f.game);f.tick(.25);
  console.log('plan CPU diagnostic',depth,`size=${f.fac.layout.size}`,JSON.stringify(f.api.stats()));
  if(!f.api.plan()){if(!size)assert.notEqual(depth,2,'positive default depth must provide one reachable encounter');facts.push({depth,size:f.fac.layout.size,seed:f.fac.layout.seed,theme:f.fac.layout.theme,skipped:true,...f.api.stats().planDiagnostic,planMs:f.api.stats().planMs});continue;}
  assert(f.api.state().ids.length>=1&&f.api.state().ids.length<=2);
  assert.equal(f.game.items.items.size,f.original.length,'no new salvage/count inflation');assert.equal(f.api.stats().metrics.colliders,0);assert.equal(f.api.stats().metrics.lights,0);
  assert(f.api.plan().routeNodes<=RECOVERY27.maxRouteNodes);assert.notEqual(f.api.plan().room,f.lift.plan.roomId,'cabinet does not use lift room');
  openOrdinaryDoors(f);const route=f.api.plan().path;walk(f,[...route,...route.slice(0,-1).reverse()]);
  facts.push({depth,size:f.fac.layout.size,seed:f.fac.layout.seed,theme:f.fac.layout.theme,ids:f.api.state().ids.length,path:route.length,routeNodes:f.api.plan().routeNodes,planMs:f.api.stats().planMs});
 }finally{f.dispose();}
}
const f=fixture(2);
try{
 f.game.mods.emit('mapLoaded',f.game.world,f.game);f.tick(.25);assert(f.api.plan());
 const savedDocument=globalThis.document;let headless;
 try{delete globalThis.document;headless=makeRecovery27(f.api.plan());assert.equal(headless.metrics.batches,5);headless.setState({released:true});}
 finally{globalThis.document=savedDocument;headless?.dispose();}
 const cabinet=f.fac.group.getObjectByName('recovery27-cabinet'),resources=new Set();cabinet.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);if(m.map)resources.add(m.map);}});
 let disposedResources=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposedResources++);
 const ids=[...f.api.state().ids],key=f.api.state().key,custody=f.api.state().custody;
 for(const id of ids){const it=f.game.items.get(id),before=f.original.find(r=>r.id===id);assert.equal(it.holder,custody);assert.equal(it.state,'held');assert.equal(it.body,null);assert.equal(it.value,before.v);assert.equal(it.baseValue,before.bv);assert.equal(it.tier,before.tr);}
 assert(stageRequest(f.game.run.descent21,'call',f.game.time,true));f.tick(.25);assert.equal(recoveryKey27(f.game),key);assert.equal(f.api.state().key,key);assert.deepEqual(f.api.state().ids,ids,'native call nonce cannot abandon held recovery IDs');
 // Restore only native lift stage for this isolated recovery scenario; no
 // recovery state/outcome is written. Return/call request nonce stays changed.
 f.game.run.descent21.liftStage='ready';assert(stageRequest(f.game.run.descent21,'return',f.game.time,true));assert.equal(recoveryKey27(f.game),key);f.game.run.descent21.liftStage='ready';delete f.game.run.descent21.target;
 f.aim('quiet');const E=f.game.findInteraction();assert.match(E?.label||'',/quiet release/);E.action();assert.equal(f.api.state().operator,'H','actual native interaction selector sends Session request');
 for(let i=0;i<6;i++)f.tick(.25);assert.equal(f.api.state().progress,1.5);
 f.game.player.look.negate();f.tick(.25);assert.equal(f.api.state().operator,null);for(let i=0;i<10;i++)f.tick(.25);assert.equal(f.api.state().progress,1.5,'looking away pauses; native time alone cannot open cabinet');
 const old=f.request('quiet');f.net.hostEpoch=1;f.game.mods.emit('hostMigrated',f.game,{self:true});assert.equal(f.api.state().progress,1.5);assert.equal(f.api.hostReq(old,'H'),false,'old host epoch cannot resume');
 f.aim('quiet');f.game.findInteraction().action();for(let i=0;i<9;i++)f.tick(.25);assert.equal(f.api.state().released,false);f.tick(.25);assert.equal(f.api.state().released,true);assert.equal(f.game.creatures.noises.length,0,'quiet release makes no native lure pulse');
 assert.equal(f.api.hostReq(f.request('noisy'),'H'),false,'already released state never emits another drop');
 for(const id of ids){const it=f.game.items.get(id),before=f.original.find(r=>r.id===id);assert.equal(it.holder,null);assert.equal(it.state,'world');assert(it.body);assert.equal(it.value,before.v);assert.equal(it.tier,before.tr);}
 const removals=f.wire.filter(e=>e.m.t==='it'&&e.m.d.e==='rm').length;f.game.mods.emit('facilityWillChange',f.game.world,f.game,3);assert(ids.every(id=>f.game.items.get(id)));assert.equal(f.wire.filter(e=>e.m.t==='it'&&e.m.d.e==='rm').length,removals,'sealing does not remove released native crew cargo');
 assert.equal(disposedResources,resources.size,'stream disposal releases every owned geometry/material/atlas exactly once');f.api.dispose();assert.equal(disposedResources,resources.size,'repeat disposal cannot touch the same resources again');
}finally{f.dispose();}

const h=fixture(2),p=fixture(2,{loot:0});
try{
 p.game.isHost=false;p.net.isHost=false;p.net.selfId='P';p.net.hostId='H';p.game.selfId='P';p.game.player.id='P';p.net.connected=true;
 h.net.transport.peers.add('P');h.net.transport.send=(m,to)=>{h.wire.push({m:structuredClone(m),to});p.net.receive(structuredClone(m),'H');};
 p.net.transport.peers.add('H');p.net.transport.send=(m)=>h.net.receive(structuredClone(m),'P');
 // Native welcome item records preserve current ID/type/value/tier, then run.
 for(const row of h.original)p.net.receive({t:'it',d:{e:'sp',...structuredClone(row)}},'H');
 h.game.mods.emit('mapLoaded',h.game.world,h.game);h.tick(.25);h.net.flush();p.tick(.01);assert.deepEqual(p.api.state().ids,h.api.state().ids);assert.deepEqual(p.api.plan(),h.api.plan());
 for(const id of h.api.state().ids)assert.equal(p.game.items.get(id).holder,h.api.state().custody);
 h.aim('noisy');const request=h.request('noisy');
 const wall=h.physics.addStaticBox(h.game.player.pos.x+(h.api.plan().noisy[0]-h.game.player.pos.x)/2,h.fac.layout.y+1,h.game.player.pos.z+(h.api.plan().noisy[2]-h.game.player.pos.z)/2,.25,1,.25);h.physics.world.step();assert.equal(h.api.hostReq(request,'H'),false,'actual solid LOS blocker rejects host action');h.physics.removeCollider(wall);h.physics.world.step();
 h.game.player.dead=true;assert.equal(h.api.hostReq(request,'H'),false);h.game.player.dead=false;
 const owned=h.game.items.get(h.original.find(r=>!h.api.state().ids.includes(r.id)).id);owned.owner='H';assert.equal(h.api.hostReq(request,'H'),false,'active beam ownership prevents opening');owned.owner=null;
 h.game.items.hostSpawn('bottles',h.game.player.pos.clone(),{holder:'H',value:44});assert.equal(h.api.hostReq(request,'H'),false,'two-handed carried salvage prevents opening');const two=[...h.game.items.all()].find(it=>it.type==='bottles');h.net.broadcast('it',{e:'rm',id:two.id});
 assert.equal(h.api.hostReq({...request,nonce:0},'H'),false);assert.equal(h.api.hostReq(request,'unknown'),false);
 const before=h.game.items.items.size;h.game.findInteraction().action();h.net.flush();p.tick(.01);assert(h.api.state().released&&p.api.state().released);assert.equal(h.game.items.items.size,before);
 assert.equal(h.game.creatures.noises.length,1);assert.equal(h.game.creatures.noises[0].loud,RECOVERY27.loud);assert.equal(h.api.hostReq(request,'H'),false);assert.equal(h.game.creatures.noises.length,1,'duplicate instant request cannot repeat native hearing pulse');
 assert.equal(p.toasts.length,1,'state arrives before new-revision open FX on actual Session dispatch');
 const stale={key:h.api.state().key,epoch:h.api.state().epoch,rev:h.api.state().rev,k:'open'};p.game.mods.emit('facilityWillChange',p.game.world,p.game,7);p.net.receive({t:'rc27fx',d:stale},'H');assert.equal(p.toasts.length,1,'delayed opening FX is suppressed while streaming');
 for(const id of h.api.state().ids){const a=h.game.items.get(id),b=p.game.items.get(id);assert.equal(a.value,b.value);assert.equal(a.tier,b.tier);assert.equal(b.holder,null);assert(b.body);}
}finally{h.dispose();p.dispose();}

const abandoned=fixture(2);
try{
 abandoned.game.mods.emit('mapLoaded',abandoned.game.world,abandoned.game);abandoned.tick(.25);const st=abandoned.api.state(),owned=[...st.ids];
 const unrelated=abandoned.original.find(r=>!owned.includes(r.id));abandoned.net.broadcast('it',{e:'held',id:unrelated.id,h:'H',sl:0});
 abandoned.game.mods.emit('facilityWillChange',abandoned.game.world,abandoned.game,3);assert(owned.every(id=>!abandoned.game.items.get(id)),'sealed floor removes only unreleased cabinet custody');assert.equal(abandoned.game.items.get(unrelated.id).holder,'H','unrelated actual crew cargo survives');
 abandoned.tick(10);assert.equal(abandoned.api.stats().planned,true,'old saved descriptor is inert while streaming');assert.equal(abandoned.api.hostReq({op:'noisy',key:st.key,epoch:st.epoch,rev:st.rev,nonce:st.nonce},'H'),false);
}finally{abandoned.dispose();}
const unloaded=fixture(2);
try{
 unloaded.game.mods.emit('mapLoaded',unloaded.game.world,unloaded.game);unloaded.tick(.25);const ids=[...unloaded.api.state().ids],other=unloaded.original.find(r=>!ids.includes(r.id));
 unloaded.net.broadcast('it',{e:'held',id:other.id,h:'H',sl:0});unloaded.game.unloadMap();assert(ids.every(id=>!unloaded.game.items.get(id)));assert.equal(unloaded.game.items.get(other.id).holder,'H','native unload wrapper removes its custody without trapping unrelated cargo');
}finally{unloaded.dispose();}
for(const [depth,theme,loot]of [[1,null,16],[3,'backrooms',16],[7,'nullreception',16],[2,null,3]]){
 const skip=fixture(depth,{theme,loot});try{skip.game.mods.emit('mapLoaded',skip.game.world,skip.game);skip.tick(.25);assert.equal(skip.api.state(),null,'intro/liminal/insufficient ordinary loot safely skip');assert.equal(skip.game.items.items.size,loot);}finally{skip.dispose();}
}
for(const text of Object.values(RECOVERY27_TEXT))for(const lang of ['tr','ru'])assert.notEqual(tIn(lang,text),text,`translation ${lang}: ${text}`);
assert.equal(errLog.total,errorsBefore,'native callbacks report no caught runtime errors');
console.log('recovery27 native routes',JSON.stringify(facts));
console.log('recovery27: native existing-ID custody/drop, standing route/return, normal E selector/Session self-delivery, quiet pause/epoch/nonce, once-only loud hearing, two-Session state-before-FX, sealing and intro/liminal skips PASS');
