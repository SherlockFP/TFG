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
 m.emit('mapLoaded',g.world,g);at(0);req('accept',0);assert.equal(g.run.life13.mission.paid,12);assert.equal(g.run.credits,32);
 // New day restores one shared opportunity; unloading cancels the unclaimed physical parcel.
 g.unloadMap();g.run.day=3;g.run.phase='company';g.run.moon='hq';g.world={company:{group:new THREE.Group(),groundY:-1.25}};
 m.emit('mapLoaded',g.world,g);at(0);req('dispatch',0);assert.equal(spawns,2);
 g.unloadMap();assert.equal(items.size,0);assert.equal(g.run.life13.mission.stage,'idle');m.emit('mapLoaded',g.world,g);g.run.life13.mission={stage:'done',paid:18};at(0);req('dispatch',0);assert.equal(spawns,2,'previous survey payment closes courier too');a.dispose();
 const hm=new Emitter();const hub={...g,mods:hm,run:{seed:12,day:1,moon:'hub',phase:'orbit',quotaIndex:0},fleet13:{docked:()=>true},world:{outdoor:{group:new THREE.Group(),vendorSpace:{},terrain:{heightAt:()=>-1.25,blocked:()=>false}}}};const ha=installLife13(hub);hm.emit('registerHandlers',(key,fn)=>requests[key]=fn,hub);hm.emit('mapLoaded',hub.world,hub);players[0].pos.copy(ha.actors.find(v=>v.id===0).pos);tick+=700;requests.l13req({op:'talk',id:0,token:'12:1:hub:hub'},'host');assert.match(notices.at(-1)[2].k,/Choose a vessel together/,'fresh hub retains fleet boarding help');assert.ok(ha.actors.every(v=>!v.role),'fresh hub has no courier role markers');ha.dispose();
 console.log('life17: actual host dispatch/delivery, LOS/proximity/custody/handoff, finite shared budget and cancellation pass');
}finally{Date.now=oldNow;}
