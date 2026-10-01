import assert from 'node:assert/strict';
import { FLEET13, sanitizeFleet13, fleetLayout, purchaseFleet13, fleetQuote13, fleetSpawnIndex13 } from '../../src/game/fleet13_core.js';
import { effects } from '../../src/game/shipyard_core.js';
import { installFleet13 } from '../../src/game/fleet13.js';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { ItemManager, WorldItem } from '../../src/entities/items.js';
import { insideShip } from '../../src/world/ship.js';
let f=sanitizeFleet13(), wallet={credits:60};
assert.equal(purchaseFleet13(f,wallet,'courier').ok,true); assert.equal(wallet.credits,60);
assert.equal(purchaseFleet13(f,wallet,'hauler').ok,false); assert.equal(f.selected,'courier');
wallet.credits=1000; assert.equal(purchaseFleet13(f,wallet,'hauler').ok,true);assert.equal(wallet.credits,480);
assert.equal(purchaseFleet13(f,wallet,'hauler').ok,true);assert.equal(wallet.credits,480);
assert.equal(purchaseFleet13(f,wallet,'constructor').ok,false);
for (const id of ['__proto__', 'constructor', 'toString']) {
 const before = JSON.stringify({ f, wallet });
 assert.equal(purchaseFleet13(f, wallet, id).ok, false);
 assert.equal(JSON.stringify({ f, wallet }), before);
 assert.deepEqual(fleetLayout(id), fleetLayout('courier'));
 assert.equal(sanitizeFleet13({ selected: id, owned: {} }).selected, null);
}
f.docked=false;assert.equal(purchaseFleet13(f,wallet,'courier').ok,false);
assert.equal(sanitizeFleet13({selected:'unknown',owned:{unknown:{}}}).selected,null);
for(const id of Object.keys(FLEET13))assert.deepEqual(fleetLayout(id).m,FLEET13[id].modules);
assert.notDeepEqual(effects(fleetLayout('hauler')),effects(fleetLayout('courier')));
assert.notDeepEqual(effects(fleetLayout('rescue')),effects(fleetLayout('courier')));
assert.notDeepEqual(effects(fleetLayout('survey')),effects(fleetLayout('courier')));
// Existing save migration, new dock entry, host-only purchases and crew dispatch.
function makeGame(){
 const handlers={},events={},sent=[];
 const game={isHost:true,selfId:'host',profile:{shipyard:{}},player:{pos:new Vector3(0,.2,30),dead:false,inShip:false,teleport(p){this.pos.copy(p);}},world:{moonId:'__relay13'},env:{setMoon(){},setSpace(){}},ship:{door:{setOpen(){}},spawns:[new Vector3(0,0,0),new Vector3(2,0,0),new Vector3(4,0,0),new Vector3(6,0,0)]},remotes:new Map([['crew',{pos:new Vector3(0,.2,30)}]]),ui:{toast(){}},mods:{on(k,fn){events[k]=fn;return ()=>{};}},net:{sendTo(id,k,d){sent.push({id,k,d});}},objectives:{compute(){return[];}},broadcastRun(){},hostSave(){},applyRunState(d){this.run={...d};},spawnInShip(){this.player.teleport(this.ship.spawns[fleetSpawnIndex13(this.selfId,this.ship.spawns.length)]);},loadMapFor(){this.world.moonId=null;},hostLever(){return'launched';},hostInit(data){this.applyRunState({phase:'orbit',credits:1000,...data});events.registerHandlers?.((k,fn)=>handlers[k]=fn,this);this.spawnInShip();}};
 const api=installFleet13(game);return {game,api,handlers,sent,events};
}
let {game,api,handlers,sent}=makeGame();game.hostInit(null,1);assert(api.docked());assert.equal(game.player.pos.z,23);
assert.match(game.objectives.compute()[0].text,/free ship/);
game.player.pos.set(0,.2,30);handlers.f13act({op:'buy',id:'hauler'},'crew');assert.equal(game.run.credits,1000);
handlers.f13act({op:'buy',id:'hauler'},'host');assert.equal(game.run.credits,480);assert.equal(game.run.fleet13.selected,'hauler');
game.player.pos.set(3,.2,9);handlers.f13act({op:'board'},'host');assert(!api.docked());assert.deepEqual(sent.map(s=>s.id),['host','crew']);
assert.notDeepEqual(sent[0].d.p,sent[1].d.p);
// Room upgrades, decorations and revival capability must follow the selected owned hull.
game.run.sy.m.R1.t=3;game.run.sy.parts.coil=7;game.hostSave();
game.world.moonId='__relay13';game.player.inShip=true;handlers.f13act({op:'dock'},'host');
game.player.pos.set(0,.2,30);handlers.f13act({op:'buy',id:'courier'},'host');assert.equal(game.run.fleet13.selected,'courier');
handlers.f13act({op:'buy',id:'hauler'},'host');assert.equal(game.run.sy.m.R1.t,3);assert.equal(game.run.sy.parts.coil,7);assert.equal(game.run.credits,480);
game.run.credits=1000;game.player.dead=true;handlers.f13act({op:'buy',id:'rescue'},'host');assert.equal(game.run.credits,1000);game.player.dead=false;
game.player.downed=true;handlers.f13act({op:'buy',id:'rescue'},'host');assert.equal(game.run.credits,1000);game.player.downed=false;
handlers.f13act({op:'buy',id:'rescue'},'host');assert.equal(game.run.sy.m.N1.id,'medbay');assert.equal(game.run.credits,320);
game.run.sy.m.N1.t=2;game.run.sy.deco.furniture=[];game.hostSave();
const recovery=fleetQuote13(game.run.fleet13,'rescue',game.run.credits);assert.equal(recovery.price,0);assert.equal(recovery.effects.reviveCost,75);assert.equal(recovery.rooms.find(r=>r.id==='medbay').tier,'II');
handlers.f13act({op:'buy',id:'courier'},'host');handlers.f13act({op:'buy',id:'rescue'},'host');assert.equal(game.run.sy.m.N1.t,2);
assert.match(game.objectives.compute()[0].text,/Recovery Vessel/);
game.player.pos.set(3,.2,9);handlers.f13act({op:'board'},'host');
const saved=JSON.parse(JSON.stringify(game.run));api.dispose();
({game,api}=makeGame());game.hostInit(saved,1);assert(!api.docked());assert.equal(game.run.fleet13.selected,'rescue');assert.equal(game.run.sy.m.N1.t,2);api.dispose();
({game,api}=makeGame());game.hostInit({credits:123,sy:fleetLayout('rescue')},1);assert(!api.docked());assert.deepEqual(game.run.sy.m,FLEET13.rescue.modules);api.dispose();
// A new campaign retains the fleet, but starts on the dock; clients receive host rooms instead of their own profile ship.
({game,api}=makeGame());game.profile.fleet13=JSON.parse(JSON.stringify(saved.fleet13));game.hostInit(null,1);assert(api.docked());assert.equal(game.run.sy.m.N1.t,2);api.dispose();
({game,api}=makeGame());game.isHost=false;game.selfId='crew';game.applyRunState(saved);game.spawnInShip();assert.equal(game.run.sy.m.N1.t,2);assert.deepEqual(game.player.pos.toArray(),game.ship.spawns[fleetSpawnIndex13('crew',4)].toArray());api.dispose();
const brochure=fleetQuote13(sanitizeFleet13(),'hauler',60);assert.equal(brochure.price,520);assert.equal(brochure.shortfall,460);assert.equal(brochure.routePct,7.5);assert.equal(brochure.effects.sellBonus,.06);assert.equal(brochure.effects.cargoSlots,24);
// Native item event/body contract: migrate an actual world item, without respawning or stealing ground/held cargo.
globalThis.window={KefalAPI:{THREE},__kefalMods:{itemModels:new Map([['robot',()=>new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshBasicMaterial())]])}};
function actualManager(g){
 const manager=Object.create(ItemManager.prototype);manager.game=g;manager.scene=new THREE.Scene();manager.items=new Map();manager.physics={
  removed:0,removeBody(){this.removed++;},createItemBody(p,q){const body={p:{x:p.x,y:p.y,z:p.z},setBodyType(){},setLinvel(){},setTranslation(p){this.p={...p};}};return{body,col:{}};}
 };g.onItemDropped=()=>{};return manager;
}
({game,api,handlers}=makeGame());api.dispose();game.items=actualManager(game);game.net.selfId='host';game.net.hostId='host';
const peerFixture=makeGame();peerFixture.api.dispose();const peer=peerFixture.game;peer.isHost=false;peer.items=actualManager(peer);peer.net.selfId='crew';peer.net.hostId='host';const peerApi=installFleet13(peer);
const dropPackets=[];game.net.broadcast=(kind,data)=>{if(kind==='it'){dropPackets.push(data);game.items.onEvent(data);peer.items.onEvent(data);}};
api=installFleet13(game);game.hostInit(null,1);game.player.pos.set(0,.2,30);handlers.f13act({op:'buy',id:'hauler'},'host');
for(const [id,p,h] of [['cargo',[9,.5,0],null],['core',[-3,.5,0],null],['ground',[9,-1.25,0],null],['outside',[30,.5,20],null],['held',[9,.5,0],'host']]){
 const data={id,ty:'robot',v:171,bv:160,p,b:33,c:9,am:7,tr:'rare',col:1,h};
 game.items.items.set(id,new WorldItem(game.items,data));peer.items.items.set(id,new WorldItem(peer.items,data));
}
const cargo=game.items.get('cargo'),identity=cargo, before={value:cargo.value,baseValue:cargo.baseValue,battery:cargo.battery,charges:cargo.charges,ammo:cargo.ammo,tier:cargo.tier,collected:cargo.collected};
handlers.f13act({op:'buy',id:'rescue'},'host');assert.equal(dropPackets.length,0); // insufficient credits: no relocation
handlers.f13act({op:'buy',id:'courier'},'host');assert.equal(dropPackets.length,1);assert.equal(dropPackets[0].e,'drop');assert.equal(dropPackets[0].id,'cargo');assert.equal(dropPackets[0].f13move,true);
assert.equal(game.items.get('cargo'),identity);assert.equal(game.items.items.size,5);assert.equal(peer.items.items.size,5);assert(insideShip(cargo.obj.position));assert.deepEqual(peer.items.get('cargo').obj.position.toArray(),cargo.obj.position.toArray());
assert.deepEqual(cargo.body.p,{x:cargo.obj.position.x,y:cargo.obj.position.y,z:cargo.obj.position.z});assert.equal(game.items.physics.removed,1);assert.equal(peer.items.physics.removed,1);
for(const [key,value]of Object.entries(before))assert.deepEqual(cargo[key],value,key+' preserved');
assert.deepEqual(game.items.get('ground').obj.position.toArray(),[9,-1.25,0]);assert.deepEqual(game.items.get('outside').obj.position.toArray(),[30,.5,20]);assert.deepEqual(game.items.get('core').obj.position.toArray(),[-3,.5,0]);assert.equal(game.items.get('held').holder,'host');
// The native ship filter now keeps it after a smaller hull rebuild. Serialize/reload preserves item metadata/position.
assert(game.items.inShipItems().includes(cargo));const data=game.items.serialize(it=>it.id==='cargo')[0];const restoredManager=actualManager(game);restoredManager.onEvent({e:'sp',...data});const restored=restoredManager.get('cargo');assert(insideShip(restored.obj.position));for(const [key,value]of Object.entries(before))assert.deepEqual(restored[key],value);
// Native run persistence filters after the smaller hull switch retain relocated cargo.
const {hostMethods}=await import('../../src/game/host.js');const {loadRun}=await import('../../src/core/save.js');
const storage=new Map();globalThis.localStorage={setItem(k,v){storage.set(k,v);},getItem:k=>storage.get(k)||null};
game.profile.name='Host';game.saveSlot=3;game.inventory={saveFields:it=>({tr:it.tier}),loadFields:s=>({tr:s.tr})};hostMethods.hostSave.call(game);const runSave=loadRun(3);assert(runSave.shipItems.some(it=>it.v===171&&it.b===33&&it.tr==='rare'&&Math.abs(it.p[0])<7));
const reload=makeGame();reload.api.dispose();const rg=reload.game;rg.items=actualManager(rg);rg.net.selfId='host';rg.net.hostId='host';rg.profile.name='Host';rg.inventory=game.inventory;rg.freshDayStats=()=>({});rg.planetColorFor=()=>0;rg.registerHandlers=()=>{};rg.updateAmbience=()=>{};rg.hostAnnounce=()=>{};rg.tutorialHint=()=>{};rg.mods.emit=()=>{};
hostMethods.hostInit.call(rg,runSave,3);const loaded=[...rg.items.all()].find(it=>it.value===171&&it.battery===33&&it.tier==='rare');assert(loaded);assert(insideShip(loaded.obj.position));assert.equal(loaded.baseValue,160);assert.equal(loaded.charges,9);assert.equal(loaded.ammo,7);
assert.equal(loaded.collected,true,'native save/reload retains prior extraction credit instead of booking old cargo again');
api.dispose();peerApi.dispose();
console.log('fleet13: purchase, distinct capabilities, host authority, dock entry, crew dispatch and save lifecycle passed');

// Actual installed DOM marker: Company peer, known selected hull, danger pauses visible budget.
const {PerspectiveCamera}=await import('three');const elements=[];globalThis.innerWidth=800;globalThis.innerHeight=600;
globalThis.document={getElementById:()=>null,body:{appendChild(el){elements.push(el);}},createElement(){return{style:{},innerHTML:'',removed:false,remove(){this.removed=true;}}}};
for(const phase of ['company','moon']){
 const f=makeGame();f.game.isHost=false;f.game.run={phase,moon:phase==='company'?'company':'hamsi',day:1,fleet13:{selected:'hauler',docked:false}};f.game.world={moonId:f.game.run.moon,seed:55};f.game.player.pos.set(2.6,-1.2,8);f.game.camera=new PerspectiveCamera();f.game.camera.updateMatrixWorld();let danger=false;f.game.onegoal={hot:()=>danger};
 const count=elements.length;f.events.update(1,f.game);assert.equal(elements.length,count+1);assert.equal(elements.at(-1).innerHTML,'SHIP ENTRY');
 danger=true;f.events.update(30,f.game);assert.ok(elements.at(-1).removed,'danger hides real DOM marker');assert.equal(elements.length,count+1);
 f.game.player.indoor=true;danger=false;f.events.update(30,f.game);assert.equal(elements.length,count+1,'facility never projects an outdoor ship cue');
 f.game.player.indoor=false;f.game.player.pos.y=-300;f.events.update(30,f.game);assert.equal(elements.length,count+1,'vertical separation excludes underground cue even before indoor flag updates');
 f.game.player.pos.y=-1.2;f.events.update(1,f.game);assert.equal(elements.length,count+2,'safe outdoor return resumes remaining visible budget');assert.equal(elements.at(-1).style.opacity,'1');
 f.events.update(13,f.game);assert.ok(elements.at(-1).removed);for(let i=0;i<20;i++)f.events.update(1,f.game);assert.equal(elements.length,count+2,'expired hint never recreates');
 f.api.dispose();
}
console.log('fleet13 installed Company/moon peer entry markers: danger pause/resume and finite expiry pass');
