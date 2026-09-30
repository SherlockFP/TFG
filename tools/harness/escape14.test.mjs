import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installEscape14, wardenAI, registerEscape14, LORE, pursuitSpawn } from '../../src/game/escape14.js';
import { ID,TUNE as T,nextPursuit,attackConnects,mayHide,mayStart } from '../../src/game/escape14_core.js';
import { CreatureManager } from '../../src/entities/creatures.js';
import { HOST_ONLY } from '../../src/net/session.js';
import { CREATURES, EXTRA_SPAWNS } from '../../src/game/creatures.js';
import { TR,RU } from '../../src/game/escape14_text.js';
import { wardenModel,soundSamples } from '../../src/game/escape14_view.js';
registerEscape14();
assert(CREATURES[ID].noSpawn&&!EXTRA_SPAWNS[ID]);assert(T.speed<8.2&&T.windup>=1);
assert.equal(nextPursuit({state:'warning',t:2.19}),null);
assert.equal(nextPursuit({state:'warning',t:2.2}),'chase');
assert.equal(nextPursuit({state:'chase',t:1,hidden:true}),'search');
assert.equal(nextPursuit({state:'chase',t:1,visible:false,lost:2.3}),'search');
assert.equal(nextPursuit({state:'windup',t:1.1,visible:true,hidden:false,distance:1.6}),'strike');
assert(!attackConnects({visible:false,hidden:false,distance:1,safe:false,age:4}));
assert(!attackConnects({visible:true,hidden:true,distance:1,safe:false,age:4}));
const base={alive:true,distance:1,vertical:0,occupied:false,giant:false,trolley:false,reviving:false,downed:false,blocked:false};
assert(mayHide(base));for(const k of ['occupied','giant','trolley','reviving','downed','blocked'])assert(!mayHide({...base,[k]:true}),k);
assert(!mayHide({...base,distance:3}));assert(!mayStart({quota:1,used:false,boss:false,mission:false,hides:3,phase:'moon'}));
function fixture(host=true){
 const events=new Map(),handles=new Map(),msgs=new Map(),sent=[],removed=[],spawns=[];
 const me={id:'p',pos:new THREE.Vector3(8,-300,5),eye:new THREE.Vector3(8,-298.4,5),dead:false,inShip:false,zone:'in',voice:0};
 const other={id:'q',pos:new THREE.Vector3(8,-300,5),eye:me.eye.clone(),dead:false,inShip:false,zone:'in',voice:0};
 const items=[];let visible=true;
 const game={isHost:host,selfId:'p',scene:new THREE.Scene(),run:{phase:'moon',quotaIndex:2,day:1,cargo13:{}},world:{moonId:'hamsi',seed:9,facility:{layout:{seed:9,y:-300,ox:0,oz:0,cell:2,rooms:[{x:1,z:1,w:6,h:6,type:'storage'},{x:15,z:1,w:6,h:6,type:'archive'},{x:28,z:1,w:6,h:6,type:'office'}]},nav:{walkableAt:()=>true,findPath:(x,z,tx,tz)=>[{x:tx,z:tz}]},doors:[],scrapSpots:[{x:70,y:-300,z:10}]}},player:{frozen:false,dead:false,downed:false,crouch:false},items:{all:()=>items.values()},mods:{creatureModels:new Map(),on:(name,fn)=>{let a=events.get(name);if(!a)events.set(name,a=[]);a.push(fn);return()=>a.splice(a.indexOf(fn),1);}},net:{msgHandlers:msgs,on_:(k,h)=>msgs.set(k,h),broadcast:(k,d)=>sent.push({k,d:structuredClone(d)}),sendTo:(id,k,d)=>sent.push({id,k,d:structuredClone(d)})},physics:{raycast:()=>({normal:{y:1},point:{y:-300}}),lineOfSight:()=>visible,addStaticBox:()=>({}),removeCollider:c=>removed.push(c)},aiPlayers:()=>[me,other],aiPlayerById:id=>[me,other].find(p=>p.id===id),broadcastRun:()=>{},unloadMap:()=>{},downed:{S:{book:{e:new Map()}},isDowned:()=>false},ui:{toast:()=>{}}};
 game.creatures={game,host:new Map(),canSee:()=>true,nearSafeZone:()=>false,hostSpawn:(type,pos,opts)=>{const c={id:'warden',type,pos,zone:'in',dmg:24,def:CREATURES[type],data:{},age:4,t:0,yaw:0,hp:240,extra:0,cooldown:0,state:opts.state,setState(s){if(s!==this.state){this.state=s;this.t=0;}}};spawns.push(c);game.creatures.host.set(c.id,c);return c;}};
 const api=installEscape14(game);game.escape14=api;
 const emit=(k,...args)=>{for(const fn of events.get(k)||[])fn(...args);};
 emit('registerHandlers',(a,h)=>handles.set(a,h));emit('mapLoaded',game.world);emit('update',1/60);emit('update',1/60);
 return {game,api,emit,handles,sent,spawns,me,other,items,removed,setVisible:v=>visible=v};
}
// Expensive activation A* must not run for candidates rejected by sight or physical body clearance.
const rejected=fixture();let searches=0;rejected.game.world.facility.nav.findPath=()=>{searches++;return [{x:0,z:0}];};
rejected.game.creatures.canSee=()=>false;assert.equal(pursuitSpawn(rejected.game,rejected.me,[rejected.me]),null);assert.equal(searches,0,'unseen candidates never run A*');
rejected.game.creatures.canSee=()=>true;rejected.game.physics.lineOfSight=(a,b)=>a.distanceTo(b)>1;assert.equal(pursuitSpawn(rejected.game,rejected.me,[rejected.me]),null);assert.equal(searches,0,'blocked body-clearance candidates never run A*');rejected.api.dispose();
const f=fixture();const warmed=[];f.emit('warm',o=>warmed.push(o),f.game);assert.equal(warmed.length,1);assert(warmed[0].children.length>6,'actual Warden silhouette prewarmed');f.game.run.quotaIndex=0;f.emit('warm',o=>warmed.push(o),f.game);assert.equal(warmed.length,1,'no newcomer warm work');f.game.run.quotaIndex=2;warmed[0].traverse(o=>{o.geometry?.dispose();o.material?.dispose();});assert.equal(f.api.shelters().length,3);assert(HOST_ONLY.has('e14state')&&HOST_ONLY.has('e14say'));
const s=f.api.shelters()[0];f.me.pos.fromArray(s.exit);f.me.eye.copy(f.me.pos).add(new THREE.Vector3(0,1.6,0));
assert(f.api.enter('p',0));assert(f.api.hidden('p'));assert(f.game.player.hiding&&f.game.player.frozen);
assert(!f.api.enter('q',0),'single occupancy');assert(f.sent.some(m=>m.k==='tp'&&m.id==='p'));
const mirror=fixture(false),packet=f.sent.findLast(m=>m.k==='e14state').d;
mirror.game.net.msgHandlers.get('e14state')(packet,'host');assert(mirror.api.hidden('p')&&mirror.game.player.hiding,'replicated hide membership');
assert(f.api.eject('p'));assert(!f.game.player.frozen&&!f.game.player.hiding);
f.items.push({holder:'p',def:{kind:'big'}});assert(!f.api.enter('p',0));f.items.length=0;
f.game.run.cargo13.driver='p';assert(!f.api.enter('p',0));f.game.run.cargo13.driver=null;
f.game.downed.S.book.e.set('q',{by:'p'});assert(!f.api.enter('p',0));f.game.downed.S.book.e.clear();
f.setVisible(false);assert(!f.api.enter('p',0),'wall blocks entry');f.setVisible(true);
// Requests operate on the authenticated sender, never an arbitrary player ID in the payload.
assert(f.api.enter('p',0));const s2=f.api.shelters()[1];f.other.pos.fromArray(s2.exit);f.other.eye.copy(f.other.pos).add(new THREE.Vector3(0,1.6,0));assert(f.api.enter('q',1));
f.handles.get('e14act')({op:'leave',id:'q'},'p');assert(!f.api.hidden('p')&&f.api.hidden('q'));f.api.eject('q');f.other.pos.copy(f.me.pos);
f.game.creatures.host.set('boss',{type:'foreman',dead:false,def:{boss:true}});assert(!f.api.trigger(),'boss blocks deliberate pursuit');f.game.creatures.host.delete('boss');
f.game.missions14={active:()=>true};assert(!f.api.trigger());f.game.missions14=null;
assert(f.api.trigger());assert.equal(f.spawns.length,1);const rows=CreatureManager.prototype.snapshot.call(f.game.creatures);assert(rows.some(r=>r[0]==='warden'&&r[5]==='warning'),'generic host creature state replication');assert(!f.api.trigger(),'one per landing');
const c=f.spawns[0],M={...f.game.creatures,playersFor:()=>[f.me,f.other],nearest:(c,ps)=>ps.length?{p:ps[0],d:c.pos.distanceTo(ps[0].pos)}:null,canSee:()=>true,moveToward:(c,p,dt,speed)=>c.pos.addScaledVector(new THREE.Vector3().subVectors(p,c.pos).normalize(),dt*speed),attack:()=>hits++};let hits=0;
wardenAI(c,.1,M);assert.equal(c.state,'warning');c.t=T.warning;wardenAI(c,.1,M);assert.equal(c.state,'chase');
c.pos.copy(f.me.pos).add(new THREE.Vector3(0,0,1));wardenAI(c,.1,M);assert.equal(c.state,'windup');
c.t=T.windup;wardenAI(c,.1,M);assert.equal(hits,1);assert.equal(c.state,'strike');
c.state='windup';c.target='p';c.t=T.windup;assert(f.api.enter('p',0));wardenAI(c,.1,M);assert.equal(c.state,'search');assert.equal(hits,1,'hidden player never struck');
f.me.pos.fromArray(s.p);f.emit('update',21);assert(!f.api.hidden('p')&&!f.game.player.frozen,'timeout ejects with rest grace');assert.equal(c.state,'rest');
c.state='chase';c.target='p';c.t=0;c.pos.copy(f.me.pos).add(new THREE.Vector3(0,0,8));M.canSee=()=>false;wardenAI(c,2.3,M);assert.equal(c.state,'search','loss of sight buys escape');
c.state='chase';c.target='p';c.t=0;c.data.lost=0;f.game.world.facility.doors=[{id:'d',kind:'door',open:false,locked:false,pos:c.pos.clone().add(new THREE.Vector3(0,0,-1))}];let opened=0;f.game.hostSetDoor=()=>opened++;const before=c.pos.clone();wardenAI(c,.5,M);assert.equal(opened,0);assert(c.pos.equals(before));wardenAI(c,1.4,M);assert.equal(opened,1,'closed door costs at least 1.8 seconds');
// A nearby closed door behind the Warden must not stall pursuit.
f.game.world.facility.doors=[{id:'behind',kind:'door',open:false,locked:false,pos:c.pos.clone().add(new THREE.Vector3(0,0,1))}];
c.state='chase';c.data.lost=0;M.canSee=()=>true;const posBefore=c.pos.clone();wardenAI(c,.1,M);assert(!c.pos.equals(posBefore),'unrelated door behind ignored');
// Actual static obstruction cancels the step even if a coarse perception source says visible.
f.game.world.facility.doors=[];f.setVisible(false);const wallBefore=c.pos.clone();wardenAI(c,.1,M);assert(c.pos.equals(wallBefore),'physical walls block Warden movement');f.setVisible(true);
// Entering an alcove outside the Warden's sight must not grant it supernatural inspection knowledge.
f.game.creatures.canSee=()=>false;f.me.pos.fromArray(s.exit);assert(f.api.enter('p',0));
c.state='search';c.data.inspect=false;c.data.inspectT=0;c.data.last.fromArray(s.p);c.pos.fromArray(s.p).add(new THREE.Vector3(0,0,1));c.t=0;
wardenAI(c,3.2,M);assert(f.api.hidden('p')&&!c.data.inspect,'unwitnessed hide is searched, never automatically inspected');f.api.eject('p');
for(const lang of [TR,RU])assert(lang[LORE]&&lang['Signal Warden']);
const model=wardenModel();for(const state of ['warning','chase','windup','search','rest'])model.update(.1,{state,time:1});model.dispose();
for(const id of ['e14_warn','e14_prime','e14_search','e14_hit']){const a=soundSamples(id,16000);assert(a.every(Number.isFinite));assert(Math.max(...a.map(Math.abs))<.8);}
mirror.api.dispose();assert(!mirror.game.player.frozen&&!mirror.game.player.hiding,'client dispose restores movement');f.api.dispose();assert(f.removed.length===12);
console.log('escape14: pure counterplay, real host AI, physical shelters, sender-bound validation, host replication, timeout/cleanup, original sound/model pass');

// Finite pursuit uses actual AI evidence, retires via the ordinary removal packet, and pays only physical salvage.
function pursuit(initialVisible=true){
 const z=fixture();z.game.creatures.hostRemove=CreatureManager.prototype.hostRemove.bind(z.game.creatures);
 assert(z.api.trigger());const c=z.spawns[0];let visible=initialVisible,hits=0;
 const M={...z.game.creatures,playersFor:()=>[z.me,z.other],nearest:()=>null,canSee:()=>visible,moveToward:()=>{},attack:()=>hits++};
 wardenAI(c,.01,M);c.t=T.warning;wardenAI(c,.01,M);assert.equal(c.state,'chase');
 return {...z,c,M,see:v=>visible=v,hits:()=>hits};
}
function finishSearch(z){z.c.t=T.search;wardenAI(z.c,.01,z.M);}
const escaped=pursuit();wardenAI(escaped.c,.01,escaped.M);escaped.see(false);wardenAI(escaped.c,T.lost+.1,escaped.M);assert.equal(escaped.c.state,'search');finishSearch(escaped);
assert.equal(escaped.game.run.escape14.result,'escaped');assert(!escaped.game.creatures.host.has('warden'));assert(escaped.sent.some(m=>m.k==='cev'&&m.d.e==='rm'));assert.equal(escaped.hits(),0);
assert(!escaped.api.claim('p'),'remote claim refused');escaped.me.pos.fromArray(escaped.api.shelters()[0].exit);escaped.me.eye.copy(escaped.me.pos).add(new THREE.Vector3(0,1.6,0));
escaped.game.items.hostSpawn=()=>null;assert(!escaped.api.claim('p'));assert.equal(escaped.game.run.escape14.result,'escaped','failed spawn does not consume reward');
let drops=0;escaped.game.items.hostSpawn=(id,pos,opts)=>{assert.equal(id,'e14_recording');assert.equal(opts.value,85);assert(pos.isVector3);drops++;return 'physical-recording';};
assert.equal(escaped.api.claim('p'),'physical-recording');assert(!escaped.api.claim('q'));assert.equal(drops,1);assert.equal(escaped.game.run.escape14.result,'claimed');escaped.api.dispose();
const unseen=pursuit(false);unseen.see(false);wardenAI(unseen.c,T.lost+.1,unseen.M);finishSearch(unseen);assert.equal(unseen.game.run.escape14.result,'failed','never witnessed an actual chase: no reward');unseen.api.dispose();
const timer=pursuit();timer.c.t=12;wardenAI(timer.c,.01,timer.M);finishSearch(timer);assert.equal(timer.game.run.escape14.result,'active','visible chase timeout reacquires, no escape');assert.equal(timer.c.state,'chase');wardenAI(timer.c,T.attempt,timer.M);assert.equal(timer.game.run.escape14.result,'failed','total time cap ends visible chase');timer.api.dispose();
const reacquired=pursuit();wardenAI(reacquired.c,.01,reacquired.M);reacquired.see(false);wardenAI(reacquired.c,T.lost+.1,reacquired.M);reacquired.see(true);wardenAI(reacquired.c,.01,reacquired.M);assert.equal(reacquired.c.state,'chase','real sight reacquires pursuit');reacquired.see(false);wardenAI(reacquired.c,T.lost+.1,reacquired.M);assert.equal(reacquired.c.state,'search');reacquired.c.t=T.search-1;wardenAI(reacquired.c,.01,reacquired.M);assert.equal(reacquired.game.run.escape14.result,'active','new search starts its own full six seconds');finishSearch(reacquired);assert.equal(reacquired.game.run.escape14.result,'escaped','fresh continuous unseen search succeeds');reacquired.api.dispose();
const tucked=pursuit();wardenAI(tucked.c,.01,tucked.M);tucked.game.creatures.canSee=()=>false;tucked.me.pos.fromArray(tucked.api.shelters()[0].exit);assert(tucked.api.enter('p',0));wardenAI(tucked.c,.01,tucked.M);assert.equal(tucked.c.state,'search');finishSearch(tucked);assert.equal(tucked.game.run.escape14.result,'escaped','unwitnessed quiet shelter completes real chase');tucked.api.dispose();
for(const reason of ['stunned','boss','dead']){const z=pursuit();wardenAI(z.c,.01,z.M);if(reason==='stunned')z.c.state='stunned';if(reason==='boss')z.game.missions14={active:()=>true};if(reason==='dead'){z.c.dead=true;z.emit('update',.01);}else wardenAI(z.c,.01,z.M);assert.equal(z.game.run.escape14.result,'failed',reason);assert(!z.api.claim('p'));z.api.dispose();}
const struck=pursuit();struck.c.pos.copy(struck.me.pos);wardenAI(struck.c,.01,struck.M);struck.c.t=T.windup;wardenAI(struck.c,.01,struck.M);assert.equal(struck.hits(),1);assert.equal(struck.game.run.escape14.result,'failed');struck.api.dispose();
console.log('escape14: finite chase evidence, continuous unseen search, safe retirement, single physical reward and failure regressions pass');

// Tiny/blocked facilities must not retry forever or rebuild a crewmate's occupied shelter.
const tiny=fixture();tiny.game.world.facility.layout.rooms=tiny.game.world.facility.layout.rooms.slice(0,1);tiny.emit('mapLoaded',tiny.game.world);tiny.emit('update',1/60);tiny.emit('update',1/60);
assert.equal(tiny.api.shelters().length,1);tiny.me.pos.fromArray(tiny.api.shelters()[0].exit);tiny.me.eye.copy(tiny.me.pos).add(new THREE.Vector3(0,1.6,0));assert(tiny.api.enter('p',0));const removedBefore=tiny.removed.length;tiny.emit('update',.5);assert(tiny.api.hidden('p')&&tiny.removed.length===removedBefore,'occupied singleton is never rebuilt');tiny.api.dispose();
const empty=fixture();empty.game.world.facility.layout.rooms=[];empty.emit('mapLoaded',empty.game.world);for(let i=0;i<10;i++)empty.emit('update',.5);const sentAfterAttempts=empty.sent.length;for(let i=0;i<10;i++)empty.emit('update',.5);assert.equal(empty.sent.length,sentAfterAttempts,'blocked facility retry/send work terminates');empty.api.dispose();

// Real facility + Rapier catches mapLoaded's stale spatial-query tree, which the small stub cannot model.
const { initPhysics,Physics,G }=await import('../../src/physics/physics.js');await initPhysics();
const canvas=()=>({width:64,height:64,style:{},getContext:()=>new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:10}):(k==='createImageData'||k==='getImageData')?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true})});
const oldDocument=globalThis.document;globalThis.document={createElement:()=>canvas()};
const { generateLayout,buildFacility }=await import('../../src/world/facility.js');
const ph=new Physics(),layout=generateLayout(1235,'factory',1),fac=buildFacility(layout,{physics:ph,lightPool:{add:e=>e,remove:()=>{}}});
const real=fixture();real.api.dispose();real.game.physics=ph;real.game.scene=new THREE.Scene();real.game.world.facility=fac;real.game.world.seed=1235;real.game.scene.add(fac.group);
real.game.engine={scene:real.game.scene};real.game.creatures=new CreatureManager(real.game);real.game.net.sendRows=()=>{};
const physicalApi=installEscape14(real.game);real.game.escape14=physicalApi;real.emit('mapLoaded',real.game.world);
assert.equal(physicalApi.shelters().length,0,'no mapLoaded probe against stale Rapier queries');
for(let i=0;i<4;i++){ph.step(1/60);real.emit('update',1/60);}
assert(physicalApi.shelters().length>=2,'seed1235 real factory has reachable shelters after physics steps');
for(const s of physicalApi.shelters()){const p=new THREE.Vector3(...s.p),floor=ph.raycast(p.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),1.5,1);assert(floor&&Math.abs(floor.point.y-layout.y)<.2);assert(fac.nav.walkableAt(s.exit[0],s.exit[2]));}
// A real generated facility uses actual HostCreature, nav following, perception and Rapier for activation/chase.
real.game.hostHurtPlayer=()=>{throw new Error('test runner failed to retreat before real windup');};real.game.hostSetDoor=(id,open)=>{const d=fac.doors.find(d=>d.id===id);if(d){d.open=open;if(open&&d.collider){ph.removeCollider(d.collider);d.collider=null;}}};
real.me.pos.fromArray(physicalApi.shelters()[0].exit);real.me.eye.copy(real.me.pos).add(new THREE.Vector3(0,1.6,0));real.other.dead=true;
const concrete=pursuitSpawn(real.game,real.me,[real.me]);assert(concrete,'actual first shelter has an engaging, nav-reachable start');assert(concrete.distanceTo(real.me.pos)>=7);
const wardenId=physicalApi.trigger();assert(wardenId,'physical activation succeeds without forced spawn');const actual=real.game.creatures.host.get(wardenId),startPos=actual.pos.clone();
assert(real.game.creatures.canSee(actual,real.me,24,360),'actual perception sees initiator from selected spawn');
function stepReal(n){for(let i=0;i<n;i++){real.game.time=(real.game.time||0)+1/60;ph.step(1/60);real.game.creatures.hostUpdate(1/60);real.emit('update',1/60);}}
stepReal(200);assert.equal(actual.state,'chase');assert(actual.data.hadSight);assert(actual.pos.distanceTo(startPos)>.1,'real nav follower moves Warden toward target');
// Close a real physical forward door during actual chase; it must buy the full delay and then open.
const toPlayer=new THREE.Vector3().subVectors(real.me.pos,actual.pos).normalize(),doorPos=actual.pos.clone().addScaledVector(toPlayer,1.7);
const testDoor={id:'escape-test-forward',kind:'door',open:false,locked:false,pos:doorPos,collider:ph.addStaticBox(doorPos.x,doorPos.y+1.2,doorPos.z,1.5,1.2,.1,Math.atan2(toPlayer.x,toPlayer.z),G.DOOR,{kind:'door'})};fac.doors.push(testDoor);ph.step(1/60);
const paused=actual.pos.clone();stepReal(100);assert(!testDoor.open,'real physical closed door cannot open early');assert(actual.pos.distanceTo(paused)<.05,'real host pursuit pauses at forward door');stepReal(20);assert(testDoor.open,'actual forward door opens after the 1.8-second counterplay window');
// Genuine native windup, then a reachable visible retreat into the no-hit 1.8–2.5m band.
// No creature state, AI flags, perception or creature position is forced.
let approach=null;for(let i=0;i<24;i++){
 const a=i*Math.PI/12,p=actual.pos.clone().add(new THREE.Vector3(Math.cos(a)*2.2,0,Math.sin(a)*2.2));
 const eye=p.clone().add(new THREE.Vector3(0,1.6,0));
 if(!fac.nav.walkableAt(p.x,p.z)||!real.game.creatures.canSee(actual,{...real.me,pos:p,eye},24,360))continue;
 if(!ph.lineOfSight(actual.pos.clone().add(new THREE.Vector3(0,.7,0)),p.clone().add(new THREE.Vector3(0,.7,0)),G.STATIC|G.DOOR))continue;
 const floor=ph.raycast(p.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),1.3,G.STATIC|G.DOOR);if(floor&&Math.abs(floor.point.y-layout.y)<.2){approach=p;break;}
}
assert(approach,'labelled nearby player fixture has actual floor/LOS');real.me.pos.copy(approach);real.me.eye.copy(approach).add(new THREE.Vector3(0,1.6,0));
for(let i=0;i<120&&actual.state!=='windup';i++)stepReal(1);
assert.equal(actual.state,'windup','native chase naturally reaches its telegraphed strike');
let retreat=null;for(let i=0;i<24;i++){
 const angle=i*Math.PI/12,p=actual.pos.clone().add(new THREE.Vector3(Math.cos(angle)*2.15,0,Math.sin(angle)*2.15));
 const eye=p.clone().add(new THREE.Vector3(0,1.6,0));
 if(!fac.nav.walkableAt(p.x,p.z)||real.me.pos.distanceTo(p)>3||!ph.lineOfSight(real.me.eye,eye,G.STATIC|G.DOOR)||!real.game.creatures.canSee(actual,{...real.me,pos:p,eye},24,360))continue;
 const floor=ph.raycast(p.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),1.3,G.STATIC|G.DOOR);
 if(floor&&Math.abs(floor.point.y-layout.y)<.2){retreat=p;break;}
}
assert(retreat,'real floor/LOS permits readable retreat beyond hit reach');real.me.pos.copy(retreat);real.me.eye.copy(retreat).add(new THREE.Vector3(0,1.6,0));
stepReal(82);assert(!['strike','rest','watch'].includes(actual.state),'missed native strike must recover pursuit, never orphan ACTIVE into rest/watch');assert.equal(real.game.run.escape14.result,'active');
// Physical panels must obstruct both perception and the movement step, without forcing creature state.
const alcove=physicalApi.shelters()[0];real.me.pos.fromArray(alcove.p);real.me.eye.copy(real.me.pos).add(new THREE.Vector3(0,1.6,0));
// Find a real floor point behind its back panel, using nav and Rapier to ensure the player position is legitimate.
let cover=null;for(const s of physicalApi.shelters()){const p=new THREE.Vector3(...s.p).add(new THREE.Vector3(0,0,-1.5));if(fac.nav.walkableAt(p.x,p.z)&&!real.game.creatures.canSee(actual,{...real.me,pos:p,eye:p.clone().add(new THREE.Vector3(0,1.6,0))},24,360)){cover=p;break;}}
assert(cover,'actual generated panel provides LOS-breaking cover');real.me.pos.copy(cover);real.me.eye.copy(cover).add(new THREE.Vector3(0,1.6,0));stepReal(520);
assert.equal(real.game.run.escape14.result,'escaped','actual pursuit completes unseen search without forced AI state/LOS flags');assert(!real.game.creatures.host.has(wardenId));
console.log('escape15: real factory activation, genuine sight, host nav chase, physical cover and finite retirement pass');
physicalApi.dispose();fac.dispose(ph);ph.world.free();globalThis.document=oldDocument;
console.log('escape14: actual factory1235/Rapier deferred-build regression passes');
