// NATIVE_INTEGRATION. Native population/Rapier/Session; initial map/player are fixture setup.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Emitter,errLog} from '../../src/core/events.js';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {ItemManager} from '../../src/entities/items.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {Session} from '../../src/net/session.js';
import {hostMethods} from '../../src/game/host.js';
import {RNG} from '../../src/core/rng.js';
import {newDescent} from '../../src/game/descent21_state.js';
import {installSalvage27} from '../../src/game/salvage27.js';
import {installEarlyHaul34} from '../../src/game/earlyhaul34.js';
import {EARLY_HAUL34} from '../../src/game/earlyhaul34.js';
import {installCargo20} from '../../src/game/cargo20.js';
import {cargoToken} from '../../src/game/cargo20_core.js';
import {installCargo13} from '../../src/game/cargo13.js';
import {itemSize,bagRejectReason} from '../../src/game/inventory_core.js';
import {loadRun} from '../../src/core/save.js';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {Game}=await import('../../src/game/game.js');
const {actionMethods}=await import('../../src/game/actions.js');
await initPhysics();window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};window.KefalAPI={THREE};
const errorStart=errLog.total;
function fixture({seed=1235,size=.8,theme='factory',enabled=true}={}){
 const physics=new Physics(),scene=new THREE.Scene(),fac=buildFacility(generateLayout(seed,theme,size),{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);for(let n=0;n<4;n++)physics.step(1/60);
 const net=new Session({strategy:'local',isHost:true,code:'early34'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
 const camera=new THREE.PerspectiveCamera(),run={runId:'campaign34',phase:'moon',moon:'hamsi',seed,day:1,quotaIndex:0,quota:330,time:480,daysLeft:3,weather:'clear'};run.descent21=newDescent(run);
 const wire=[],players=[];const game={isHost:true,selfId:'H',time:0,run,config:{inventorySlots:4},hostData:{powerUsed:0},world:{moonId:'hamsi',seed,descent21Depth:0,facility:fac},scene,engine:{scene,camera,punch(){}},camera,physics,net,mods:new Emitter(),stats:{speedMul:1,carryRelief:0,maxHp:100,maxStamina:100,staminaRegen:16},settings:{keys:{interact:'KeyE'}},audio:{has:()=>true,play:()=>({stop(){}}),at(){}},remotes:new Map(),input:{enabled:true},ui:{toast(){},hud:{setPrompt(){}}},profile:{name:'native'},ship:{door:{open:true}},saveSlot:34,
  aiPlayers:()=>players,aiPlayerById:id=>players.find(p=>p.id===id),downed:{isDowned:()=>false},hostSpawnWave(){},hostEarlySafeFilter:()=>null,hostHurtPlayer(){},onItemHeld(){},onItemDropped(){},onItemImpact(){},broadcastRun:hostMethods.broadcastRun};
 game.creatures=new CreatureManager(game);game.items=new ItemManager(game);game.player=new LocalPlayer(game);game.player.teleport(fac.mainDoor.spawn,fac.mainDoor.faceYaw);game.player.inShip=false;
 Object.assign(game,{hasPerk:()=>false,sfx(){},ensureSlots:actionMethods.ensureSlots,findInteraction:actionMethods.findInteraction,interactablesNow(){const out=[];game.mods.emit('interactables',out,game);return out;},doorById:Game.prototype.doorById,hostSetDoor:hostMethods.hostSetDoor,hostDamageItem:hostMethods.hostDamageItem,onItemImpact(it,dv){actionMethods.onItemImpact.call(game,it,dv);},onItemValueLost(){},useExit:actionMethods.useExit,hostBeginTakeoff(){},hostOnPlayerLeave(){},unloadMap(){},hostAnnounce(){},helloData:()=>({name:'native'}),ensureRemote(){}});
 const player={id:'H',pos:game.player.pos,eye:new THREE.Vector3(),look:game.player.forward(),dead:false,downed:false,inShip:false,zone:'in'};players.push(player);
 net.on_('it',d=>{wire.push({t:'it',d:structuredClone(d)});game.items.onEvent(d);game.onItem?.(d);});net.on_('cev',d=>game.creatures.onEvent(d));net.on_('gs',d=>{wire.push({t:'gs',d:structuredClone(d)});game.onRun?.(d);});
 net.on_('door',d=>Game.prototype.onDoor.call(game,d));net.on_('tp',d=>game.player.teleport(new THREE.Vector3(...d.p),d.yaw));
 const salvage=installSalvage27(game);if(enabled)game.earlyHaul34=installEarlyHaul34(game);
 const step=(dt=1/60)=>{Game.prototype.updateDoors.call(game,dt);physics.step(dt,fdt=>game.grab?.physicsStep(fdt));game.time+=dt;game.items.update(dt);net.flush();};
 function populate(){
  // Comparison-only replay of original spawn value/ID/yaw entropy. Three's model
  // UUID allocations use raw entropy; changed visuals inherently allocate different UUID counts.
  // No player, collision, cargo or other outcome is supplied by this replay.
  const raw=Math.random,rng=new RNG('original native population entropy'),entropy=[];Math.random=()=>{
   if(!new Error().stack.split('\n')[2].includes('ItemManager.hostSpawn'))return raw();
   const v=rng.next();entropy.push(v);return v;
  };
  try{hostMethods.hostPopulateMoon.call(game);}finally{Math.random=raw;}return{rows:wire.filter(m=>m.t==='it'&&m.d.e==='sp').map(m=>m.d),entropy};
 }
 return{game,fac,physics,net,wire,players,player,step,populate,dispose(){game.grab?.stop();game.grab?.line.removeFromParent();game.grab?.line.geometry.dispose();game.grab?.line.material.dispose();game.earlyHaul34?.dispose();salvage.dispose();game.creatures.clearAll();game.items.clearAll();game.items.dispose();physics.world.removeCharacterController(game.player.ctrl);physics.removeBody(game.player.body);fac.dispose(physics);physics.dispose();net.transport.leave();net.clear();}};
}
const control=fixture({enabled:false}),offered=fixture();
try{
 const before=control.populate(),after=offered.populate();
 console.log('placement diagnostics',JSON.stringify(offered.game.earlyHaul34.stats()));
 const changed=after.rows.filter((row,i)=>row.ty!==before.rows[i]?.ty);
 assert.equal(changed.length,1,'first ordinary factory population offers one existing Indexed Glass slot');assert.equal(changed[0].ty,'indexedglass27');
 assert.equal(after.rows.length,before.rows.length);assert.deepEqual(after.entropy,before.entropy,'all original spawn value/ID/yaw draws retained');
 for(let i=0;i<after.rows.length;i++){const a={...after.rows[i]},b={...before.rows[i]};if(a.id===changed[0].id){delete a.ty;delete b.ty;delete a.p;delete b.p;delete a.q;delete b.q;}assert.deepEqual(a,b,'all original economy/identity and later prize fields preserved');}
 console.log('PASS native paired population replaces exactly one slot preserving economy / IDs / entropy / deep prize');
}finally{control.dispose();offered.dispose();}

function check(name,fn,opts){const f=fixture(opts);try{fn(f);console.log('PASS',name);}finally{f.dispose();}}
check('actual factory size1.0 and Hamsi size.8 use bounded main-entrance plans',f=>{
 f.populate();const p=f.game.earlyHaul34.plan(),s=f.game.earlyHaul34.stats();assert(p);assert.equal(p.source,'mainEntrance');assert.deepEqual(p.path[0],[f.fac.mainDoor.spawn.x,f.fac.layout.y,f.fac.mainDoor.spawn.z]);
 assert(s.nodes<=EARLY_HAUL34.maxNodes&&s.probes<=EARLY_HAUL34.maxProbes&&s.sites<=EARLY_HAUL34.maxSites);assert(p.length<=EARLY_HAUL34.maxRoute);assert(Object.isFrozen(p)&&Object.isFrozen(p.path));
 const it=f.game.items.get(f.game.run.earlyHaul34.id);assert.deepEqual(it.size.toArray(),p.size);assert.equal(itemSize(it.def),null);assert.match(bagRejectReason(it),/Too big/);
 console.log('size1 plan',JSON.stringify({pose:p.p,length:p.length,...s}));
},{size:1});
for(const seed of [17,1])check(`ordinary Hamsi seed${seed} bounded admission smoke`,f=>{
 const rows=f.populate().rows,p=f.game.earlyHaul34.plan(),s=f.game.earlyHaul34.stats();assert(s.nodes<=EARLY_HAUL34.maxNodes&&s.probes<=EARLY_HAUL34.maxProbes&&s.sites<=EARLY_HAUL34.maxSites);
 assert.equal(rows.filter(row=>row.ty==='indexedglass27').length,p?1:0);assert.equal(!!f.game.run.earlyHaul34,!!p);if(p)assert(p.length<=EARLY_HAUL34.maxRoute);
 console.log('seed smoke',JSON.stringify({seed,result:p?'offered':'stock fallback',pose:p?.p,length:p?.length,...s}));
},{seed});

check('native synchronous gs/sp callbacks cannot replay a removed offer',f=>{
 let atRun=0,atSpawn=0;f.game.onRun=d=>{if(d.earlyHaul34){atRun++;assert(f.game.run.earlyHaul34);assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null);}};
 f.game.onItem=d=>{if(d.e==='sp'&&d.ty==='indexedglass27'){atSpawn++;assert.equal(f.game.run.earlyHaul34.id,d.id);f.net.broadcast('it',{e:'rm',id:d.id});assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null);}};
 f.populate();assert.equal(atRun,1);assert.equal(atSpawn,1);const receipt=structuredClone(f.game.run.earlyHaul34);assert.equal(f.game.items.get(receipt.id),undefined);
 f.game.player.dead=true;f.game.mods.emit('hostMigrated',f.game);f.game.mods.emit('mapUnloaded',f.game.world,f.game);f.game.mods.emit('mapLoaded',f.game.world,f.game);assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null);assert.deepEqual(f.game.run.earlyHaul34,receipt);
 f.game.player.dead=false;f.game.run.descent21.depth=1;f.game.world.descent21Depth=1;assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null);f.game.run.descent21.depth=0;f.game.world.descent21Depth=0;f.populate();assert.equal(atSpawn,1,'surface return keeps one campaign offer');
});

check('real host save and welcome preserve receipt and one native cargo identity',f=>{
 f.populate();const id=f.game.run.earlyHaul34.id,receipt=structuredClone(f.game.run.earlyHaul34),store=new Map(),oldStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 try{hostMethods.hostSave.call(f.game);assert.deepEqual(loadRun(34).earlyHaul34,receipt);}finally{globalThis.localStorage=oldStorage;}
 const peer=fixture();peer.game.isHost=peer.net.isHost=false;peer.net.selfId='P';peer.net.hostId='H';peer.net.players.set('P',{id:'P'});let welcomed;
 peer.net.on_('welcome',d=>{welcomed=d;peer.game.run=structuredClone(d.run);peer.game.items.clearAll();for(const row of d.items)peer.game.items.onEvent({e:'sp',...row});});
 const rawSend=f.net.transport.send;f.net.transport.peers.add('P');f.net.transport.send=(m,to)=>{if(to==='P'||!to)peer.net.receive(m,'H');};
 try{hostMethods.hostOnPlayerJoin.call(f.game,'P',{name:'partner'});f.net.flush();assert(welcomed);assert.deepEqual(peer.game.run.earlyHaul34,receipt);assert.equal(peer.game.items.get(id).type,'indexedglass27');assert.equal([...peer.game.items.all()].filter(it=>it.id===id).length,1);assert.equal(peer.game.earlyHaul34.populationOffer(peer.fac.bigSpots,1),null);peer.game.isHost=peer.net.isHost=true;peer.game.mods.emit('hostMigrated',peer.game);assert.equal(peer.game.earlyHaul34.populationOffer(peer.fac.bigSpots,1),null);}
 finally{f.net.transport.send=rawSend;peer.dispose();}
});

check('private same-kind spawn proposal rejects forgery, pocket/holder and stale map',f=>{
 const offer=f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1);assert(offer);
 const spawn=(type,opts)=>{const id=f.game.items.hostSpawn(type,new THREE.Vector3(6,-299,55),opts);return f.game.items.get(id);};
 assert.equal(spawn('vase',{earlyHaul34:{...offer}}).type,'vase');assert.equal(spawn('cup',{earlyHaul34:offer}).type,'cup');assert.equal(spawn('vase',{holder:'H',earlyHaul34:offer}).type,'vase');assert(!f.game.run.earlyHaul34);
 f.game.world.seed++;assert.equal(spawn('vase',{earlyHaul34:offer}).type,'vase');f.game.world.seed--;assert(!f.game.run.earlyHaul34);assert.equal(spawn('vase',{earlyHaul34:offer}).type,'indexedglass27');assert(f.game.run.earlyHaul34);
});

check('actual locked entrance branch or static blockage falls back stock, retry only fresh map',f=>{
 const d=f.fac.doors.find(d=>d.id==='d0');f.net.broadcast('door',{id:d.id,open:false,locked:true,silent:true});
 assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null);assert(!f.game.run.earlyHaul34);
 f.net.broadcast('door',{id:d.id,open:false,locked:false,silent:true});assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null,'no repeated costly planning this visit');
 f.game.mods.emit('mapUnloaded',f.game.world,f.game);const wall=f.physics.addStaticBox(0,-299,54,8,1,.15);f.step();assert.equal(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1),null,'real static wall blocks the haul route');
 f.physics.removeCollider(wall);f.step();f.game.mods.emit('mapUnloaded',f.game.world,f.game);assert(f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1));assert(!f.game.run.earlyHaul34,'planning alone never consumes campaign offer');
});

check('off-scope phase/quota/depth/peer/context and disposed instance preserve stock',f=>{
 const attempt=()=>f.game.earlyHaul34.populationOffer(f.fac.bigSpots,1);
 f.game.run.phase='orbit';assert.equal(attempt(),null);f.game.run.phase='moon';f.game.run.quotaIndex=1;assert.equal(attempt(),null);f.game.run.quotaIndex=0;
 f.game.world.descent21Depth=f.game.run.descent21.depth=1;assert.equal(attempt(),null);f.game.world.descent21Depth=f.game.run.descent21.depth=0;
 f.game.isHost=false;assert.equal(attempt(),null);f.game.isHost=true;f.game.run.moon='hq';assert.equal(attempt(),null);f.game.run.moon='hamsi';
 f.game.earlyHaul34.dispose();f.game.earlyHaul34.dispose();assert.equal(attempt(),null);assert(!f.game.run.earlyHaul34);
});

check('real native door opening and controller traverse the certified pickup route',f=>{
 f.populate();const p=f.game.earlyHaul34.plan();hostMethods.registerHandlers.call(f.game);
 for(const id of p.doors)f.net.request('door',{id,open:true});for(let i=0;i<30;i++)f.step();assert(p.doors.every(id=>!f.game.doorById(id).collider));
 const local=f.game.player,offset=local.body.translation().y-local.pos.y;
 for(const target of p.path.slice(1,p.path.findIndex(row=>row===p.approach)+1)){
  let n=0;while(Math.hypot(local.pos.x-target[0],local.pos.z-target[2])>.075&&n++<60){const dx=target[0]-local.pos.x,dz=target[2]-local.pos.z,len=Math.hypot(dx,dz),speed=Math.min(.06,len);local.ctrl.computeColliderMovement(local.col,{x:dx/len*speed,y:-.02,z:dz/len*speed});const m=local.ctrl.computedMovement(),b=local.body.translation();local.body.setNextKinematicTranslation({x:b.x+m.x,y:b.y+m.y,z:b.z+m.z});f.step();const moved=local.body.translation();local.pos.set(moved.x,moved.y-offset,moved.z);}assert(n<60,'native controller made progress without position injection');
 }
 assert(local.pos.distanceTo(new THREE.Vector3(...p.approach))<.2);
 const it=f.game.items.get(f.game.run.earlyHaul34.id);f.game.camera.position.copy(local.pos).add(new THREE.Vector3(0,1.5,0));f.game.camera.lookAt(it.obj.position);actionMethods.localActions.call(f.game,0,{enabled:false});assert.equal(f.game.findInteraction()?.bigItem,it,'real pickup ray finds the glass');
 const start=it.body.translation();f.game.findInteraction().action();assert.equal(it.owner,'H','actual grab Session transfers ownership');f.game.camera.lookAt(it.obj.position.clone().add(new THREE.Vector3(0,.35,0)));for(let i=0;i<30;i++)f.step();assert(Math.hypot(it.body.translation().y-start.y,it.body.translation().z-start.z)>.12,'actual grab physics moves load');
 f.game.grab.stop();assert.equal(it.owner,null,'actual release Session returns host authority');assert.equal(it.holder,null);assert.equal(it.id,f.game.run.earlyHaul34.id);assert.equal(itemSize(it.def),null);
});

function braceTrial(brace){const f=fixture();let cargo;try{
 f.populate();const g=f.game,p=g.earlyHaul34.plan(),it=g.items.get(g.run.earlyHaul34.id);for(const id of p.doors)g.hostSetDoor(id,true,true);for(let n=0;n<60;n++)f.step();
 // Setup-labelled native moving load and partner stance. These are initial conditions;
 // the only deceleration under test is the actual contextual partner request.
 const body=it.body.translation(),partner={id:'P',pos:new THREE.Vector3(body.x,-300,body.z-1.7),eye:new THREE.Vector3(body.x,-298.5,body.z-1.7),look:new THREE.Vector3(0,-.45,1).normalize(),dead:false};f.players.push(partner);f.net.players.set('P',{id:'P'});
 cargo=installCargo20(g);hostMethods.registerHandlers.call(g);it.body.setLinvel({x:0,y:0,z:-3.5},true);g.items.update(1/60);const before=it.body.linvel(),value=it.value,start=it.body.translation().z;
 const peer=new Session({strategy:'local',isHost:false,code:'early34'});peer.selfId='P';peer.hostId='H';peer.transport.peers.add('H');peer.transport.send=m=>f.net.receive(m,'P');
 try{if(brace){peer.request('cg20n',{id:it.id,op:'brake',token:cargoToken(g.run),n:1});peer.flush();const after=it.body.linvel();assert(Math.abs(after.z)<Math.abs(before.z));assert.equal(after.y,before.y);assert.equal(it.holder,null);assert.equal(it.owner,null);}for(let n=0;n<30;n++)f.step();assert.equal(it.value,value,'benign native brace leaves fragile value unchanged');return start-it.body.translation().z;}
 finally{peer.transport.leave();peer.clear();}
 }finally{cargo?.dispose();f.dispose();}}
const rolling=braceTrial(false),braked=braceTrial(true);assert(rolling>.1&&braked>=0&&braked<rolling*.6,`real partner reduces sliding travel ${rolling}→${braked}`);console.log('PASS real partner native brake travel',rolling.toFixed(4),'→',braked.toFixed(4));

check('native partner brace rejects active beam owner, occupied hands and real LOS obstruction',f=>{
 f.populate();const g=f.game,it=g.items.get(g.run.earlyHaul34.id),b=it.body.translation(),partner={id:'P',pos:new THREE.Vector3(b.x,-300,b.z-1.7),eye:new THREE.Vector3(b.x,-298.5,b.z-1.7),look:new THREE.Vector3(0,-.45,1).normalize(),dead:false};f.players.push(partner);const cargo=installCargo20(g);hostMethods.registerHandlers.call(g);let n=0;
 const attempt=()=>{g.time++;it.body.setLinvel({x:0,y:0,z:-3.5},true);return cargo.hostNudge({id:it.id,op:'brake',token:cargoToken(g.run),n:++n},'P');};
 try{g.net.request('grab',{id:it.id});assert.equal(it.owner,'H');assert.equal(attempt(),false);g.net.request('release',{id:it.id,p:it.obj.position.toArray(),q:it.obj.quaternion.toArray(),lv:[0,0,0],av:[0,0,0]});
 const heldId=g.items.hostSpawn('shotgun',new THREE.Vector3(),{holder:'P'});assert.equal(attempt(),false);g.net.broadcast('it',{e:'rm',id:heldId});const wall=f.physics.addStaticBox(b.x,-299,b.z-.85,.6,1,.06);f.step();assert.equal(attempt(),false);f.physics.removeCollider(wall);f.step();assert.equal(attempt(),true);}
 finally{cargo.dispose();}
});

check('existing trolley custody loads/unloads the offered native ID once; no receipt reset',f=>{
 f.populate();const g=f.game,id=g.run.earlyHaul34.id,it=g.items.get(id),receipt=structuredClone(g.run.earlyHaul34),b=it.body.translation();
 // Trolley begins at the measured load site for this isolated custody test.
 // Physical portal transport is separately required in root's actual Game QA.
 g.run.cargo13={map:`hamsi:${g.run.seed}:1:`,p:[b.x,-300,b.z-1.5],yaw:0,driver:null,ids:[]};g.player.teleport(new THREE.Vector3(b.x,-300,b.z-2.5));
 const cargo=installCargo13(g);g.mods.emit('mapLoaded',g.world,g);hostMethods.registerHandlers.call(g);
 try{g.net.request('cg13act',{op:'load',id});assert.equal(it.holder,'c:cargo13');assert.deepEqual(g.run.cargo13.ids,[id]);assert.equal(it.body,null);g.net.request('cg13act',{op:'load',id});assert.deepEqual(g.run.cargo13.ids,[id]);cargo.release(true);assert.equal(it.holder,null);assert(it.body);assert.deepEqual(g.run.cargo13.ids,[]);const drops=f.wire.filter(m=>m.t==='it'&&m.d.e==='drop'&&m.d.id===id).length;cargo.release(true);assert.equal(f.wire.filter(m=>m.t==='it'&&m.d.e==='drop'&&m.d.id===id).length,drops);assert.deepEqual(g.run.earlyHaul34,receipt);assert.equal(g.earlyHaul34.populationOffer(f.fac.bigSpots,1),null);}
 finally{cargo.dispose();}
});

const spawnSource=ItemManager.prototype.hostSpawn.toString(),overrideAt=spawnSource.indexOf('const offer = opts.earlyHaul34');for(const original of ['this.hostResolveTier(def, opts)','Math.random() * (b - a)','this.nextId++','const yaw = opts.yaw ?? Math.random()'])assert(spawnSource.indexOf(original)>=0&&spawnSource.indexOf(original)<overrideAt,'original native roll precedes replacement');
assert.equal(errLog.total,errorStart,'no swallowed emitter failures');
