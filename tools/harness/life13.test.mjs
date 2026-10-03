import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Emitter } from '../../src/core/events.js';
import { installLife13 } from '../../src/game/life13.js';

// Company citizens must be removed before the world owner disappears during travel.
const mods = new Emitter();
const game = {
  mods, run: { phase: 'company', moon: 'hq', day: 1, seed: 12 }, isHost: true,
  world: { company: { group: new THREE.Group(), groundY: -1.25 } },
  physics: { raycast() { return null; } }, broadcastRun() {},
  unloadMap() { this.world.company = null; },
};
const api = installLife13(game);
mods.emit('mapLoaded', game.world, game);
assert.equal(api.actors.length, 5);
mods.emit('update', .1, game);
game.run.phase = 'orbit';
game.unloadMap();
assert.equal(api.actors.length, 0, 'no actor retains the disposed world');
mods.emit('update', .1, game);
api.dispose();
console.log('life13: actual company unload removes citizens before orbit update');

// Expeditions are solitary apart from the native crew and creatures; no wandering surveyor clutter.
{
 const m=new Emitter(),g={mods:m,run:{phase:'moon',moon:'hamsi',day:1,seed:12},isHost:true,
  world:{facility:{},outdoor:{group:new THREE.Group()},terrain:{heightAt:()=>-1.25,blocked:()=>false}},
  physics:{raycast(){return null;}},broadcastRun(){},unloadMap(){}};
 const a=installLife13(g);m.emit('mapLoaded',g.world,g);assert.equal(a.actors.length,0,'moon surveyors removed');assert.equal(a.beacon,null);a.dispose();
}

// Execute the actual registered host handler and interactable actions, not a parallel state model.
const oldNow=Date.now;let tick=100000;Date.now=()=>tick;
try{
 const m=new Emitter(),items=new Map(),requests={},players=[{id:'host',pos:new THREE.Vector3()},{id:'peer',pos:new THREE.Vector3()}];
 let blocked=false,spawns=0,removed=0;const notices=[];
 const g={mods:m,run:{phase:'company',moon:'hq',day:2,seed:12,credits:20},isHost:true,
  world:{company:{group:new THREE.Group(),groundY:-1.25}},physics:{raycast(){return blocked?{}:null;}},
  aiPlayerById:id=>players.find(p=>p.id===id),broadcastRun(){},hostSave(){},unloadMap(){},
  items:{get:id=>items.get(id),all:()=>items.values(),hostSpawn(type,pos){const id=`parcel${++spawns}`;items.set(id,{id,type,state:'world',holder:null,pos});return id;}},
  net:{sendTo(...args){notices.push(args);},broadcast(channel,d){if(d.e==='rm'){items.delete(d.id);removed++;}},request(channel,d){tick+=700;requests[channel](d,'host');}}
 };
 const a=installLife13(g);m.emit('registerHandlers',(key,fn)=>requests[key]=fn,g);m.emit('mapLoaded',g.world,g);
 const tok=()=>`${g.run.seed}:${g.run.day}:${g.run.moon}:field`;
 const req=(op,id,from='host',extra={})=>{tick+=700;requests.l13req({op,id,token:tok(),...extra},from);};
 const at=(id,from='host')=>players.find(p=>p.id===from).pos.copy(a.actors.find(p=>p.id===id).pos);
 g.run.day=1;at(0);req('talk',0);assert.ok(!JSON.stringify(notices.at(-1)).includes('Amber seal'),'locked city keeps original traveler dialogue');req('dispatch',0);assert.equal(spawns,0,'first hub has no courier issuance');const fresh=[];m.emit('interactables',fresh,g);assert.ok(!fresh.some(v=>v.label.includes('Dispatch')));g.run.day=2;m.emit('update',.1,g);
 at(0);blocked=true;req('dispatch',0);assert.equal(spawns,0,'LOS blocks issuance');blocked=false;
 players[0].pos.set(100,0,100);req('dispatch',0);assert.equal(spawns,0,'remote issuance denied');
 at(0);const out=[];m.emit('interactables',out,g);assert.match(out[0].label,/Dispatch/);out[0].action();
 assert.equal(spawns,1);const parcel=items.get(g.run.life13.courier.item);assert.equal(g.run.life13.mission.stage,'courier');
 req('dispatch',0);assert.equal(spawns,1,'repeated issuance cannot duplicate parcel');
 at(1,'peer');req('deliver',1,'peer',{amount:9000,item:'forged'});assert.equal(g.run.credits,20,'world parcel is not proof of custody');
 parcel.state='held';parcel.holder='host';req('deliver',1,'peer');assert.equal(g.run.credits,20,'other holder denied');
 parcel.holder='peer';parcel.inv={k:'bag'};
 blocked=true;req('deliver',1,'peer');assert.equal(g.run.credits,20,'delivery LOS required');blocked=false;
 req('deliver',1,'peer',{amount:9000});assert.equal(g.run.credits,32,'peer can deliver transferred native parcel for fixed reward');
 assert.equal(g.run.life13.mission.paid,12);assert.equal(items.size,0);assert.equal(removed,1);
 req('deliver',1,'peer');at(0);req('dispatch',0);assert.equal(g.run.credits,32);assert.equal(spawns,1,'reward is crew/day finite');
 // City payment also closes the existing moon survey/barter budget.
 g.unloadMap();g.run.phase='moon';g.run.moon='test';g.world={facility:{},outdoor:{group:new THREE.Group(),terrain:{heightAt:()=>-1.25,blocked:()=>false}}};
 m.emit('mapLoaded',g.world,g);assert.equal(a.actors.length,0);req('accept',0);assert.equal(g.run.life13.mission.paid,12);assert.equal(g.run.credits,32);
 // New day restores one shared opportunity; unloading cancels the unclaimed physical parcel.
 g.unloadMap();g.run.day=3;g.run.phase='company';g.run.moon='hq';g.world={company:{group:new THREE.Group(),groundY:-1.25}};
 m.emit('mapLoaded',g.world,g);at(0);req('dispatch',0);assert.equal(spawns,2);
 g.unloadMap();assert.equal(items.size,0);assert.equal(g.run.life13.mission.stage,'idle');m.emit('mapLoaded',g.world,g);g.run.life13.mission={stage:'done',paid:18};at(0);req('dispatch',0);assert.equal(spawns,2,'previous survey payment closes courier too');a.dispose();
 const hm=new Emitter();const hub={...g,mods:hm,run:{seed:12,day:1,moon:'hub',phase:'orbit',quotaIndex:0},fleet13:{docked:()=>true},world:{outdoor:{group:new THREE.Group(),vendorSpace:{},terrain:{heightAt:()=>-1.25,blocked:()=>false}}}};const ha=installLife13(hub);hm.emit('registerHandlers',(key,fn)=>requests[key]=fn,hub);hm.emit('mapLoaded',hub.world,hub);players[0].pos.copy(ha.actors.find(v=>v.id===0).pos);tick+=700;requests.l13req({op:'talk',id:0,token:'12:1:hub:hub'},'host');assert.match(notices.at(-1)[2].k,/Choose a vessel together/,'fresh hub retains fleet boarding help');assert.ok(ha.actors.every(v=>!v.role),'fresh hub has no courier role markers');ha.dispose();
 console.log('life17: actual host dispatch/delivery, LOS/proximity/custody/handoff, finite shared budget and cancellation pass');
}finally{Date.now=oldNow;}

// Central all-access exposes actual day-one E actions to both host and peer.
// Opening/issuing the activity does not bypass custody or grant its completion reward.
for(const from of ['host','peer']){
 const hm=new Emitter(),pm=new Emitter(),handlers={},items=new Map();let spawns=0;
 const players=[{id:'host',pos:new THREE.Vector3()},{id:'peer',pos:new THREE.Vector3()}];
 const run={phase:'company',moon:'hq',day:1,quotaIndex:0,seed:12,credits:20};
 const host={mods:hm,run,isHost:true,onboard:{unlocks:()=>({mode:'all'})},
  world:{company:{group:new THREE.Group(),groundY:-1.25}},physics:{raycast:()=>null},
  aiPlayerById:id=>players.find(p=>p.id===id),broadcastRun(){},hostSave(){},unloadMap(){},
  items:{get:id=>items.get(id),all:()=>items.values(),hostSpawn(type,pos){const id=`fresh${++spawns}`;items.set(id,{id,type,state:'world',holder:null,pos});return id;}},
  net:{sendTo(){},broadcast(){},request(channel,d){handlers[channel](d,'host');}}};
 const ha=installLife13(host);hm.emit('registerHandlers',(key,fn)=>handlers[key]=fn,host);hm.emit('mapLoaded',host.world,host);
 const peer={...host,mods:pm,isHost:false,world:{company:{group:new THREE.Group(),groundY:-1.25}},net:{...host.net,request(channel,d){handlers[channel](d,'peer');}}};
 const pa=installLife13(peer);pm.emit('mapLoaded',peer.world,peer);
 const g=from==='host'?host:peer,m=from==='host'?hm:pm,a=from==='host'?ha:pa;
 assert.ok(a.actors[0].role,'day-one central all-access builds a physical courier marker');
 const interactions=[];m.emit('interactables',interactions,g);
 const dispatch=interactions.find(i=>i.label.includes('Dispatch'));
 assert.ok(dispatch,`${from} receives the native E dispatch interaction`);
 assert.equal(run.credits,20);assert.equal(spawns,0,'access alone grants no parcel or reward');
 players.find(p=>p.id===from).pos.copy(ha.actors[0].pos);dispatch.action();
 assert.equal(spawns,1);assert.equal(run.life13.mission.stage,'courier');
 assert.equal(run.life13.mission.paid,0);assert.equal(run.credits,20,'physical issuance is not completion/payment');
 assert.equal(items.get(run.life13.courier.item).state,'world','native custody still required');
 pa.dispose();ha.dispose();
}
console.log('life13: day-one central all-access host/peer native E access without reward grant');

// Model bounds and owned lifecycle matter to curated route width and repeated map visits.
const {createCitizen13}=await import('../../src/models/life13.js');
const {createParcel17,courierMarker17}=await import('../../src/models/life17.js');
for(let id=0;id<5;id++){
 const model=createCitizen13(id),owned=new Set(),mats=new Set();let released=0,matReleased=0,batches=0,triangles=0;
 model.root.traverse(o=>{if(o.isMesh){batches++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;owned.add(o.geometry);mats.add(o.material);}});
 for(const geo of owned)geo.addEventListener('dispose',()=>released++);for(const mat of mats)mat.addEventListener('dispose',()=>matReleased++);
 model.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.root),size=bounds.getSize(new THREE.Vector3());
 assert.ok(size.x<1.05&&size.z<.8&&size.y<2.1,'citizen stays inside bounded native walking envelope');
 assert.ok(batches<=22&&triangles<5500,'private articulated model remains bounded');
 for(const time of [0,.2,1,3]){model.update(.1,time,true,false);model.root.updateMatrixWorld(true);assert.ok(model.root.matrixWorld.elements.every(Number.isFinite));}
 model.dispose();model.dispose();assert.equal(released,owned.size);assert.equal(matReleased,mats.size);
 console.log(`citizen18 ${id}: ${batches} batches / ${triangles} triangles, bounds/lifecycle pass`);
}
const parcel=createParcel17(),caseBounds=new THREE.Box3().setFromObject(parcel).getSize(new THREE.Vector3());
assert.ok(caseBounds.x<.5&&caseBounds.y<.35&&caseBounds.z<.4,'native courier physics envelope remains compact');
parcel.traverse(o=>o.geometry?.dispose());
for(const recipient of [false,true]){const marker=courierMarker17(recipient),geo=new Set();let n=0;marker.root.traverse(o=>{if(o.geometry)geo.add(o.geometry);});for(const g of geo)g.addEventListener('dispose',()=>n++);marker.dispose();marker.dispose();assert.equal(n,geo.size);}
