import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {Physics,initPhysics,G} from '../../src/physics/physics.js';
import {installGrenades} from '../../src/game/grenades.js';
import {KINDS,kindOfItem,fuseAfterCook} from '../../src/game/grenades_core.js';
const context=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});
const node=()=>({children:[],style:{},dataset:{},classList:{add(){},remove(){}},append(...a){this.children.push(...a);},appendChild(a){this.children.push(a);return a;},insertBefore(a){this.children.push(a);},remove(){},querySelector:()=>null,getContext:()=>context});
globalThis.document={createElement:node,body:node(),head:node(),getElementById:()=>null};globalThis.window=globalThis;
await initPhysics();
function setup(isHost=true){
 const physics=new Physics();physics.addStaticBox(0,-.1,0,30,.1,30);physics.addStaticBox(0,1,2,2,1,.1,0,G.DOOR);physics.world.step();
 const handlers=new Map(),messages=[],netFns=new Map(),items=new Map(),noises=[],damage=[],crew=[],sounds=[],mods=new Emitter();Object.assign(mods,{soundGens:new Map(),itemModels:new Map()});
 const p={id:'H',pos:new THREE.Vector3(0,0,0),eye:new THREE.Vector3(0,1.4,0),look:new THREE.Vector3(0,0,1),dead:false,inShip:false};
 let other;
 const g={isHost,selfId:isHost?'H':'P',time:0,run:{phase:'moon',moon:'hamsi'},mods,physics,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),engine:{shake(){},flash(){},punch(){}},lights:{},player:{...p,vel:new THREE.Vector3(),heldItem:()=>items.values().next().value,update(){}},stats:{},input:{enabled:true,mouseDown:()=>false},ui:{blocksInput:()=>false},items:{get:id=>items.get(id),all:()=>items.values()},remotes:new Map(),aiPlayerById:id=>id==='H'?p:null,aiPlayers:()=>[p],downed:{isDowned:()=>false},creatures:{host:new Map(),views:new Map(),noise:(pos,loud)=>noises.push([pos.clone(),loud]),damage:(id,n)=>damage.push([id,n])},hostHurtPlayer:(id,n)=>crew.push([id,n]),audio:{at:(key)=>sounds.push(key),play(){}},useHeldPress(){},dropHeld(){},onHostDeath(){},net:{hostId:'H',selfId:isHost?'H':'P',on_:(t,f)=>netFns.set(t,f),broadcast(t,d){messages.push([t,d]);if(t==='it'&&d.e==='rm')items.delete(d.id);netFns.get(t)?.(d,'H');other?.netFns.get(t)?.(structuredClone(d),'H');},sendTo(id,t,d){if(id==='P')other?.netFns.get(t)?.(structuredClone(d),'H');},request(op,d){handlers.get(op)?.(d,'H');}}};
 const api=installGrenades(g);mods.emit('registerHandlers',(k,f)=>handlers.set(k,f),g);mods.emit('netReady',g.net,g);
 function give(id='bot',holder='H'){const it={id,type:'bouncebot',def:{charges:1},holder,charges:1};items.set(id,it);return it;}
 function deploy(extra={}){return handlers.get('grth')({id:'bot',o:[0,1.4,.4],v:[100,500,0],ck:99,...extra},'H');}
 function tick(dt=1/60,n=1){for(let i=0;i<n;i++){g.time+=dt;physics.step(dt);mods.emit('update',dt,g);}}
 return {g,p,api,physics,handlers,messages,netFns,items,noises,damage,crew,sounds,give,deploy,tick,connect:peer=>{other=peer;}};
}
assert.equal(kindOfItem('bouncebot'),'bouncer');assert.equal(KINDS.bouncer.price,90);assert.equal(fuseAfterCook('bouncer',99),9);
const host=setup(),peer=setup(false);host.connect(peer);host.give();host.deploy();assert.equal(host.items.size,0,'one accepted native item consumed exactly once');assert.equal(host.api.balls.size,1);assert.equal(peer.api.balls.size,1);
const bot=[...host.api.balls.values()][0];assert.equal(bot.p.vx,0,'client force is ignored');assert.equal(bot.p.vz,2.8,'host actual look controls initial direction');
for(let i=0;i<90;i++){host.tick();peer.tick();}assert.ok(bot.p.grounded&&bot.p.y>.22&&bot.p.y<.25,`native shape ground contact ${bot.p.y}`);assert.ok(bot.p.bounces>0&&bot.p.vz<0,'real robot volume reflects off closed native door');assert.ok(host.noises.some(([,v])=>v===2.6),'moving bot pulses native hearing');assert.ok(peer.api.balls.get(bot.gid).mesh.position.distanceTo(bot.mesh.position)<.6,'peer interpolates native host states');
// Known ownership/charges, far/occluded origin, downed actor and max active rejection do not spend an item.
host.give();host.p.dead=true;host.deploy();assert.ok(host.items.has('bot'));host.p.dead=false;host.g.downed.isDowned=()=>true;host.deploy();assert.ok(host.items.has('bot'));host.g.downed.isDowned=()=>false;
for(const invalid of [-1,NaN,Infinity,.5]){host.items.get('bot').charges=invalid;const n=host.api.balls.size;host.deploy();assert.ok(host.items.has('bot'));assert.equal(host.api.balls.size,n,'invalid native charge cannot deploy');}host.items.get('bot').charges=1;
host.deploy({o:[20,1,0]});assert.ok(host.items.has('bot'));host.give('bot','P');host.deploy();assert.ok(host.items.has('bot'));host.items.get('bot').holder='H';host.items.get('bot').inv={};host.deploy();assert.ok(host.items.has('bot'));delete host.items.get('bot').inv;
host.g.time+=1;host.deploy();assert.equal(host.api.balls.size,2);host.give();host.g.time+=1;host.deploy();assert.ok(host.items.has('bot'),'owner active cap leaves charge intact');
// A native hostile with LOS triggers a full warning; a wall-screened hostile cannot trigger.
const target={id:'enemy',pos:new THREE.Vector3(bot.p.x,0,bot.p.z+.8),def:{height:1.2,radius:.3,power:1,dmg:8},dead:false,maxHp:100};host.g.creatures.host.set(target.id,target);host.g.creatures.host.set('boss',{...target,id:'boss',def:{...target.def,boss:true}});host.p.pos.set(bot.p.x,0,bot.p.z);host.tick();assert.ok(bot.warnLeft>=1.18,'warning begins with at least1s');assert.equal(host.damage.length,0);
host.tick(1/60,50);assert.equal(host.damage.length,0,'never detonates early during warning');host.tick(1/60,30);assert.ok(host.damage.some(([id,n])=>id==='enemy'&&n<=75&&n>0));assert.ok(host.damage.some(([id,n])=>id==='boss'&&n>0&&n<=35));assert.ok(host.crew.some(([,n])=>n>0&&n<=18),'actual nearby crew receives bounded native blast damage');host.tick(1/60,90);assert.equal(host.messages.filter(([t,d])=>t==='grfx'&&d.k==='bm'&&d.gid===bot.gid).length,1,'same projectile never detonates twice');
// Floor lifecycle cancels only indoor runner IDs without a blast, leaves outdoor native ball alive.
host.g.creatures.host.clear();host.g.mods.emit('phase','moon',host.g);host.p.pos.y=-240;host.p.eye.y=-238.6;host.give();host.g.time+=1;host.deploy({o:[0,-238.6,.4]});const before=host.damage.length;host.g.mods.emit('facilityWillChange',host.g);assert.equal(host.api.balls.size,0);assert.equal(host.damage.length,before);assert.ok(host.messages.some(([t,d])=>t==='grfx'&&d.dud));
host.p.pos.y=0;host.p.eye.y=1.4;host.give();host.g.time+=1;host.deploy();host.g.mods.emit('facilityWillChange',host.g);assert.equal(host.api.balls.size,1,'surface bot survives same-floor indoor replacement');
// Native host snapshot sync reconstructs active runner state in an empty late peer using the same balls ledger.
peer.g.mods.emit('phase','moon',peer.g);host.handlers.get('grrs')({},'P'); // unknown actor must be refused
assert.equal(peer.api.balls.size,0);host.g.aiPlayerById=id=>id==='P'?{...host.p,id:'P'}:host.p;host.handlers.get('grrs')({},'P');assert.equal(peer.api.balls.size,1);
const live=[...peer.api.balls.values()][0];peer.g.isHost=true;peer.g.net.hostId='P';peer.tick();assert.ok(Number.isFinite(live.p.x),'replicated runner can continue under promoted native authority');
const screened=setup();screened.give();screened.deploy();screened.g.creatures.host.set('screened',{id:'screened',pos:new THREE.Vector3(0,0,2.4),def:{height:1.2,power:1,dmg:8},dead:false});screened.tick(1/60,45);assert.equal([...screened.api.balls.values()][0].warnLeft,-1,'closed native door blocks proximity trigger despite nearby hostile');
for(const s of [host,peer,screened]){s.api.dispose();s.physics.world.free();}
console.log('boombot22: native held request/charge, real volume door reflection/ground, noise, warn/blast, caps, peer/sync/lifecycle pass');
