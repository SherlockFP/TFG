import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Physics,initPhysics,G} from '../../src/physics/physics.js';
import {WorldItem,ItemManager} from '../../src/entities/items.js';
import {installCargo20} from '../../src/game/cargo20.js';
import {cargoToken,impulseCargo} from '../../src/game/cargo20_core.js';
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
