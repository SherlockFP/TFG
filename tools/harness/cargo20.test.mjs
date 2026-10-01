import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import * as THREE from 'three';
import {Physics,initPhysics,G} from '../../src/physics/physics.js';
import {WorldItem,ItemManager} from '../../src/entities/items.js';
import {installCargo20} from '../../src/game/cargo20.js';
import {cargoToken,impulseCargo,approachingCargo,brakeCargo} from '../../src/game/cargo20_core.js';
import {nudgeLabel} from '../../src/game/cargo20_text.js';
import {setLang} from '../../src/core/i18n.js';
globalThis.window=globalThis;await initPhysics();
const physics=new Physics();physics.addStaticBox(0,-.1,0,10,.1,10);physics.addStaticBox(0,1,2,.8,1,.1);
const scene=new THREE.Scene(),handlers=new Map(),listeners=new Map(),items=new Map();
const player={id:'H',pos:new THREE.Vector3(0,0,0),eye:new THREE.Vector3(0,1.4,0),look:new THREE.Vector3(0,0,1),dead:false};
const game={isHost:true,selfId:'H',time:1,run:{runId:'test',phase:'moon',moon:'hamsi',seed:1,day:1},world:{moonId:'hamsi'},physics,net:{hostId:'H',selfId:'H',request:(op,d)=>handlers.get(op)(d,'H')},engine:{scene},mods:{on(ev,fn){const a=listeners.get(ev)||[];a.push(fn);listeners.set(ev,a);return()=>{};}},player,input:{enabled:true},ui:{},settings:{keys:{interact:'KeyF'}},aiPlayerById:id=>id==='H'?player:null,onItemImpact(){},downed:{isDowned:()=>false}};
const mgr={game,physics,scene,items,get:id=>items.get(id),all:()=>items.values()};game.items=mgr;
const it=new WorldItem(mgr,{id:'v',ty:'vase',v:120,p:[0,.7,1]});items.set(it.id,it);for(let i=0;i<120;i++)physics.step(1/60);ItemManager.prototype.update.call(mgr,1/60);
game.findInteraction=()=>({label:'Original beam',bigItem:it,action:()=>{game.beamStarted=true;}});
const original=game.findInteraction,api=installCargo20(game);for(const fn of listeners.get('registerHandlers'))fn((k,f)=>handlers.set(k,f),game);
let n=0;const req=extra=>handlers.get('cg20n')({id:it.id,token:cargoToken(game.run),n:++n,...extra},'H');
assert.match(game.findInteraction().label,/Push \[F\]/);const before=it.body.translation().z;game.findInteraction().action();n=1;
assert.ok(it.body.linvel().z>0,'actual contextual E sends host request and applies native impulse');assert.equal(it.holder,null);assert.equal(it.owner,null);assert.equal(it.value,120);
assert.equal(req({n:1}),false,'replay rejected');assert.equal(req({}),false,'immediate repeat cooldown');
for(let i=0;i<120;i++)physics.step(1/60);ItemManager.prototype.update.call(mgr,1/60);const moved=it.body.translation().z-before;assert.ok(moved>=.15 && moved<.85,`useful bounded native ground displacement ${moved}`);assert.equal(it.body.mass(),8,'native mass is8, distinct from30 carry weight');
// Drive native impulses toward a real wall, never translate or bypass the collider.
for(let i=0;i<25;i++){game.time+=1;req({});for(let j=0;j<60;j++)physics.step(1/60);ItemManager.prototype.update.call(mgr,1/60);}
assert.ok(it.body.translation().z<1.9-it.size.z/2+.03,'native wall prevents push crossing');
const peerPhysics=new Physics(),peerGame={net:{hostId:'H',selfId:'P'}},peerMgr={game:peerGame,physics:peerPhysics,scene:new THREE.Scene(),items:new Map()};
const peer=new WorldItem(peerMgr,{id:'v',ty:'vase',v:120,p:[0,.7,1]});peerMgr.items.set(peer.id,peer);peerMgr.get=id=>peerMgr.items.get(id);
const snap=ItemManager.prototype.collectSnapshot.call(mgr,'H');ItemManager.prototype.applySnapshot.call(peerMgr,snap);ItemManager.prototype.update.call(peerMgr,1);
assert.ok(peer.obj.position.distanceTo(it.obj.position)<.002,'existing native item snapshots replicate same ID and physical position');assert.equal(peer.value,120);assert.equal(peer.holder,null);
function rejected(change,restore){game.time+=1;change();assert.equal(req({}),false);restore();}
rejected(()=>it.holder='P',()=>it.holder=null);rejected(()=>it.owner='P',()=>it.owner=null);rejected(()=>it.inv={bag:1},()=>it.inv=null);rejected(()=>it.selling=true,()=>it.selling=false);rejected(()=>it.ladder={},()=>it.ladder=null);rejected(()=>player.dead=true,()=>player.dead=false);rejected(()=>game.downed.isDowned=()=>true,()=>game.downed.isDowned=()=>false);rejected(()=>player.pos.x=20,()=>player.pos.x=0);rejected(()=>game.world.moonId='wrong',()=>game.world.moonId='hamsi');
rejected(()=>it.body.setBodyType(1,true),()=>it.body.setBodyType(0,true));
items.set('held',{holder:'H',def:{hands:2}});assert.equal(req({}),false);items.delete('held');
const wall=physics.addStaticBox(0,1,.5,.5,1,.1);physics.step(1/30);assert.equal(req({}),false,'host LOS blocks through-wall requests');physics.world.removeCollider(wall,true);
assert.equal(req({token:'previous map'}),false);assert.equal(handlers.get('cg20n')({id:it.id,token:cargoToken(game.run),n:++n},'forged'),false);
it.body.setLinvel({x:0,y:0,z:3},true);assert.equal(impulseCargo(it,player.look),false,'speed cap refuses runaway stacking');
assert.equal(impulseCargo(peer,player.look),false,'replica cannot apply authoritative force');
assert.equal(brakeCargo(peer),false,'replica cannot apply authoritative braking force');
// Cancel a real active burst at the next physics boundary when custody, aim, map or hands change.
let impulses=0;const originalImpulse=it.body.applyImpulse.bind(it.body);it.body.applyImpulse=(...args)=>{impulses++;return originalImpulse(...args);};
function stops(change,restore){
 it.body.setTranslation({x:0,y:.4,z:1},true);it.body.setLinvel({x:0,y:0,z:0},true);player.look.set(0,0,1);game.time+=1;
 assert.equal(req({}),true);const at=impulses;change();physics.step(1/30);assert.equal(impulses,at,'invalidated burst adds no further impulses');restore();
}
stops(()=>it.holder='P',()=>it.holder=null);
stops(()=>it.owner='P',()=>it.owner=null);
stops(()=>it.selling=true,()=>it.selling=false);
stops(()=>player.look.set(0,0,-1),()=>player.look.set(0,0,1));
stops(()=>player.pos.x=20,()=>player.pos.x=0);
stops(()=>game.run.seed=2,()=>game.run.seed=1);
stops(()=>items.set('held',{holder:'H',def:{hands:2}}),()=>items.delete('held'));

const server=new WorldItem(mgr,{id:'server',ty:'server',v:200,p:[4,2,1]});items.set(server.id,server);player.pos.x=4;player.eye.x=4;
for(let i=0;i<120;i++)physics.step(1/60);ItemManager.prototype.update.call(mgr,1/60);const impacts=[];game.onItemImpact=(item,dv)=>impacts.push([item.id,dv]);const serverStart=server.body.translation().z;game.time+=1;
assert.equal(req({id:server.id}),true);let maximum=0;
for(let i=0;i<30;i++){physics.step(1/60);ItemManager.prototype.update.call(mgr,1/60);const v=server.body.linvel();maximum=Math.max(maximum,Math.hypot(v.x,v.z));}
const heavyMoved=server.body.translation().z-serverStart;assert.equal(server.body.mass(),55);assert.ok(heavyMoved>=.15&&heavyMoved<.85,`heavy native movement ${heavyMoved}`);assert.ok(maximum<=2.51,`native heavy speed ${maximum}`);assert.equal(impacts.filter(([id])=>id==='server').length,0,'native impact threshold does not trigger fragile damage during the shove');
console.log(`native server mass55/carryweight150 moved ${heavyMoved.toFixed(4)}m over.5s, maxspeed ${maximum.toFixed(3)}`);server.dispose();
api.dispose();assert.equal(game.findInteraction,original);it.dispose();peer.dispose();physics.world.free();peerPhysics.world.free();
console.log(`cargo20: actual installed E, native ground movement ${moved.toFixed(4)}m/wall, custody/forgery/replay/caps and native peer snapshots pass`);

// NATIVE_INTEGRATION: fresh authoritative Rapier worlds, same labelled rolling setup,
// actual contextual action/handler and native impact/value callbacks. No body transform
// is written by the feature; the initial velocity and selector are test fixtures.
const {actionMethods}=await import('../../src/game/actions.js');
const {hostMethods}=await import('../../src/game/host.js');
function braceFixture(type='vase'){
 const ph=new Physics();ph.addStaticBox(0,-.1,0,10,.1,10);
 const ls=new Map(),hs=new Map(),is=new Map(),messages=[],hits=[];
 const crew={id:'H',pos:new THREE.Vector3(0,0,0),eye:new THREE.Vector3(0,1.4,0),look:new THREE.Vector3(0,0,1),dead:false};
 const g={isHost:true,selfId:'H',time:1,run:{runId:'brace',phase:'moon',moon:'hamsi',seed:27,day:1},world:{moonId:'hamsi'},physics:ph,engine:{scene:new THREE.Scene()},player:crew,input:{enabled:true},ui:{},settings:{keys:{interact:'KeyF'}},audio:{at(){}},onItemValueLost(){},downed:{isDowned:()=>false},mods:{on(ev,fn){const a=ls.get(ev)||[];a.push(fn);ls.set(ev,a);return()=>{a.splice(a.indexOf(fn),1);};}},aiPlayerById:id=>id==='H'?crew:null};
 const manager=Object.assign(Object.create(ItemManager.prototype),{game:g,physics:ph,scene:g.engine.scene,items:is});g.items=manager;
 g.net={hostId:'H',selfId:'H',request(op,d){messages.push(['request:'+op,d]);return hs.get(op)?.(d,'H');},broadcast(op,d){messages.push([op,d]);if(op==='it')manager.onEvent(d);}};
 g.hostDamageItem=hostMethods.hostDamageItem.bind(g);
 g.onItemImpact=(item,dv)=>{hits.push([item.id,dv]);actionMethods.onItemImpact.call(g,item,dv);};
 const load=new WorldItem(manager,{id:'rolling',ty:type,v:200,p:[0,2,1.8]});is.set(load.id,load);
 for(let i=0;i<120;i++){ph.step(1/60);manager.update(1/60);}hits.length=0;messages.length=0;
 g.findInteraction=()=>({label:'Native big-item fixture',bigItem:load,action(){}});
 const runtime=installCargo20(g);for(const fn of ls.get('registerHandlers')||[])fn((k,f)=>hs.set(k,f),g);
 const request=(d={},from='H')=>hs.get('cg20n')({id:load.id,token:cargoToken(g.run),n:100,...d},from);
 const tick=(n=1)=>{for(let i=0;i<n;i++){g.time+=1/60;ph.step(1/60);manager.update(1/60);}};
 return {g,crew,ph,load,manager,messages,hits,request,tick,runtime,dispose(){runtime.dispose();load.dispose();ph.world.free();}};
}
function rollingTrial(type,brace){
 const f=braceFixture(type);try{
  f.load.body.setLinvel({x:0,y:0,z:-3.5},true);f.manager.update(1/60);
  const start=f.load.body.translation(),before=f.load.body.linvel(),beforeValue=f.load.value;
  assert.equal(approachingCargo(f.load,f.crew.pos),true);
  if(brace){
   assert.match(f.g.findInteraction().label,/Brace \[F\]/);f.g.findInteraction().action();
   const after=f.load.body.linvel();assert.equal(after.y,before.y,'native opposing horizontal impulse leaves gravity velocity untouched');
   assert.ok(Math.abs(after.z)<Math.abs(before.z));
   assert.equal(f.load.body.isDynamic(),true);assert.equal(f.load.state,'world');assert.equal(f.load.holder,null);assert.equal(f.load.owner,null);
  }
  f.tick(30);const travel=start.z-f.load.body.translation().z;
  assert.equal(f.load.value,beforeValue,'benign native shove/brace causes no fragile price damage');
  assert.equal(f.hits.length,0,'bounded deceleration does not trigger native >4.2 impact detector');
  assert.equal(f.messages.filter(([op,d])=>op==='it'&&['val','held','own','drop'].includes(d.e)).length,0);
  if(brace){
   const remotePhysics=new Physics(),remoteGame={net:{hostId:'H',selfId:'P'}},remoteMgr={game:remoteGame,physics:remotePhysics,scene:new THREE.Scene(),items:new Map()};
   const remote=new WorldItem(remoteMgr,{id:f.load.id,ty:type,v:beforeValue,p:[0,2,1.8]});remoteMgr.items.set(remote.id,remote);remoteMgr.get=id=>remoteMgr.items.get(id);
   try{ItemManager.prototype.applySnapshot.call(remoteMgr,f.manager.collectSnapshot('H'));ItemManager.prototype.update.call(remoteMgr,1);assert.ok(remote.obj.position.distanceTo(f.load.obj.position)<.002,'native braked body snapshot reaches replica');assert.equal(remote.value,beforeValue);assert.equal(remote.owner,null);assert.equal(remote.holder,null);}finally{remote.dispose();remotePhysics.world.free();}
  }
  return {travel,mass:f.load.body.mass()};
 }finally{f.dispose();}
}
for(const type of ['vase','server']){
 const control=rollingTrial(type,false),braced=rollingTrial(type,true);
 assert.equal(control.mass,type==='server'?55:8);assert.equal(braced.mass,control.mass);
 assert.ok(control.travel>.1);assert.ok(braced.travel>=0&&braced.travel<control.travel*.6,`${type}: useful native stopping reduction ${control.travel} -> ${braced.travel}`);
 console.log(`native ${type} mass${control.mass} rolling travel over.5s ${control.travel.toFixed(4)} -> ${braced.travel.toFixed(4)}m`);
}
const bf=braceFixture();try{
 const reset=()=>{bf.load.body.setLinvel({x:0,y:0,z:-3.5},true);bf.g.time+=1;};
 reset();assert.equal(bf.request({op:'brake',n:1}),true);assert.equal(bf.request({op:'brake',n:1}),false,'brake replay rejected');
 reset();assert.equal(bf.request({op:'brake',n:1}),false,'old nonce cannot replay after cooldown');
 let serial=1;
 const rejectedBrake=(change,restore)=>{reset();change();assert.equal(bf.request({op:'brake',n:++serial}),false);restore();};
 rejectedBrake(()=>bf.load.holder='c:cargo13',()=>bf.load.holder=null);
 rejectedBrake(()=>bf.load.owner='P',()=>bf.load.owner=null);
 rejectedBrake(()=>bf.load.inv={k:'bag'},()=>bf.load.inv=null);
 rejectedBrake(()=>bf.load.selling=true,()=>bf.load.selling=false);
 rejectedBrake(()=>bf.crew.dead=true,()=>bf.crew.dead=false);
 rejectedBrake(()=>bf.g.downed.isDowned=()=>true,()=>bf.g.downed.isDowned=()=>false);
 rejectedBrake(()=>bf.crew.pos.x=20,()=>bf.crew.pos.x=0);
 rejectedBrake(()=>bf.crew.look.set(0,0,-1),()=>bf.crew.look.set(0,0,1));
 rejectedBrake(()=>bf.g.items.items.set('held',{holder:'H',def:{hands:2}}),()=>bf.g.items.items.delete('held'));
 rejectedBrake(()=>bf.load.body.setLinvel({x:0,y:0,z:3.5},true),()=>{});
 rejectedBrake(()=>bf.load.body.setLinvel({x:3.5,y:0,z:0},true),()=>{});
 rejectedBrake(()=>bf.load.body.setLinvel({x:0,y:0,z:-.6},true),()=>{});
 rejectedBrake(()=>bf.load.body.setBodyType(1,true),()=>bf.load.body.setBodyType(0,true));
 const wall=bf.ph.addStaticBox(0,1,.7,1,1,.1);bf.ph.step(1/30);reset();assert.equal(bf.request({op:'brake',n:++serial}),false,'real wall denies brake LOS');bf.ph.removeCollider(wall);
 reset();assert.equal(bf.request({op:'brake',n:++serial,token:'old map'}),false);assert.equal(bf.request({op:'brake',n:++serial},'forged'),false);assert.equal(bf.request({op:'invalid',n:++serial}),false);
 // A successful stop erases a previously queued native shove; no later prestep reverses it.
 bf.load.body.setLinvel({x:0,y:0,z:0},true);bf.g.time+=1;assert.equal(bf.request({op:'push',n:++serial}),true);
 bf.load.body.setLinvel({x:0,y:0,z:-3.5},true);bf.g.time+=1;assert.equal(bf.request({op:'brake',n:++serial}),true);
 let extra=0;const old=bf.load.body.applyImpulse.bind(bf.load.body);bf.load.body.applyImpulse=(...a)=>{extra++;return old(...a);};bf.tick();assert.equal(extra,0,'old shove burst cannot reapply force after brace');
 // Vertical danger stays native: bracing a setup-labelled fast fall leaves its
 // downward velocity intact and the real impact/economy path still charges damage.
 const beforeFall=bf.load.value;bf.g.time+=1;bf.load.body.setLinvel({x:0,y:-8,z:-3.5},true);assert.equal(bf.request({op:'brake',n:++serial}),true);
 assert.equal(bf.load.body.linvel().y,-8);bf.manager.update(1/60);
 assert.ok(bf.hits.some(([,dv])=>dv>4.2));assert.ok(bf.load.value<beforeFall,'brace grants no immunity to native violent impact/value path');
 bf.load.body.setLinvel({x:0,y:-8,z:-10},true);const fast=bf.load.body.linvel();assert.equal(brakeCargo(bf.load,{deltaSpeed:100,maxImpulse:Infinity}),true);
 const bounded=bf.load.body.linvel();assert.ok(Math.abs(bounded.z-fast.z)>0&&Math.abs(bounded.z-fast.z)<4.2,'even oversized options cannot create a benign >4.2 impact');assert.equal(bounded.y,fast.y);
}finally{bf.dispose();}
for(const [lang,word]of [['en','Brace'],['tr','Frenle'],['ru','затормозить']]){setLang(lang);assert.ok(nudgeLabel('Load','F',true).includes(`${word} [F]`));}setLang('en');
console.log('cargo20 brace: native mass8/55 stopping, contextual input, gravity/impact/value, replay/custody/LOS/crew states and burst cleanup pass');
