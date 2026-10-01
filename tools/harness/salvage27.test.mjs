// NATIVE_INTEGRATION: real Rapier, LocalPlayer, native item events/visual custody,
// Carry2 host requests and CreatureManager hearing. Flat map/audio/network are
// controlled fixtures; this is not browser, human play or Internet co-op proof.
import assert from 'node:assert/strict';
import {register} from 'node:module';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Emitter,errLog} from '../../src/core/events.js';
import {Physics,initPhysics,G} from '../../src/physics/physics.js';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {RemotePlayer} from '../../src/entities/remote.js';
import {ItemManager} from '../../src/entities/items.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {hostMethods} from '../../src/game/host.js';
import {ITEMS,itemDef,SCRAP_TABLE,BIG_TABLES} from '../../src/game/items.js';
import {installCarry2} from '../../src/game/carry2.js';
import {installSalvage27} from '../../src/game/salvage27.js';
import {SALVAGE27_ITEMS,SALVAGE27_SCRAP,SALVAGE27_BIG,SALVAGE27_SOUND as C} from '../../src/game/salvage27_core.js';
import {salvage27ModelStats} from '../../src/models/salvage27.js';
import {CUSTODY,loadable} from '../../src/game/cargo13_core.js';
import {tIn} from '../../src/core/i18n.js';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {actionMethods}=await import('../../src/game/actions.js');
await initPhysics();
window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};window.KefalAPI={THREE};
const physics=new Physics(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,1,.1,200),mods=new Emitter();scene.add(camera);
physics.addStaticBox(0,-.2,0,80,.2,80,0,G.STATIC);
const handlers=new Map(),listeners=new Map(),sent=[],hints=[];let pressure=0;
const downed=new Set();
const game={isHost:true,selfId:'host',time:0,run:{phase:'moon',moon:'hamsi',seed:27,day:1,quotaIndex:0},mods,physics,scene,camera,
 engine:{scene,camera,fx:{punch:new THREE.Vector3(),shake:0},punch(){},shake(){}},settings:{reduceMotion:true,headBob:false,fov:70,tagAvatars:false},
 world:{facility:{layout:{theme:'office',seed:27},contains:()=>false}},remotes:new Map(),
 stats:{maxHp:100,maxStamina:100,staminaRegen:20,speedMul:1},audio:{play:()=>null,at(){},has:()=>false},lights:{},ui:{toast:(...a)=>hints.push(a),hud:{setInventory(){},floatText(){}}},
 downed:{isDowned:id=>downed.has(id)},balance:{onNoise:()=>pressure++,scale:()=>({detect:1,speed:1,hp:1,dmg:1})},
 sfx(){},footstep(){},hasPerk:()=>false,itemDefOf:itemDef,playerName:id=>id,dropItem(){},damageLocal(){},
 net:{selfId:'host',hostId:'host',hostEpoch:0,on_(k,fn){listeners.set(k,fn);},broadcast(k,d){sent.push({k,d:structuredClone(d),at:game.time});if(k==='it')game.items.onEvent(d);listeners.get(k)?.(d,'host');},request(k,d){handlers.get(k)?.(d,'host');},send(){}},
};
for(const name of ['onItemHeld','onItemDropped','refreshHeldVisuals','refreshRemoteHeld','updateRemoteHeldVisibility','handAnchor','onItemImpact','onItemValueLost'])game[name]=actionMethods[name];
game.hostDamageItem=hostMethods.hostDamageItem;
const input={consumeMouse:()=>({dx:0,dy:0}),pressed:()=>false,isDown:k=>keys.has(k),mouseDown:()=>false};const keys=new Set();game.input=input;
game.player=new LocalPlayer(game);game.player.teleport(new THREE.Vector3(-20,.03,20),0);game.player.inShip=false;
game.items=new ItemManager(game);game.creatures=new CreatureManager(game);
const peer=new RemotePlayer(game,'peer',{name:'Peer'});peer.pos.copy(game.player.pos).add(new THREE.Vector3(1.5,0,0));peer.target.copy(peer.pos);game.remotes.set(peer.id,peer);
game.aiPlayers=()=>[{id:game.selfId,pos:game.player.pos,dead:game.player.dead,inShip:false,zone:'out'},...[...game.remotes.values()].map(p=>({id:p.id,pos:p.pos,dead:p.dead,inShip:false,zone:'out'}))];
game.aiPlayerById=id=>game.aiPlayers().find(p=>p.id===id);
game.carry2=installCarry2(game);
const unchanged=Object.fromEntries(['factory','mineshaft','backrooms'].map(k=>[k,JSON.stringify([SCRAP_TABLE[k],BIG_TABLES[k]])]));
const api=installSalvage27(game);
mods.emit('registerHandlers',(k,fn)=>handlers.set(k,fn),game);
const errorsBefore=errLog.total;
const soundRows=()=>sent.filter(e=>e.k==='fx'&&e.d.s==='vent_rattle');
function frames(n,{walk=false,sprint=false,follow=false,renew=false}={}){
 keys.clear();if(walk)keys.add('forward');if(sprint)keys.add('sprint');
 for(let i=0;i<n;i++){
  game.time+=1/60;game.player.update(1/60,input);physics.step(1/60);game.items.update(1/60);
  if(follow)peer.pos.copy(game.player.pos).add(new THREE.Vector3(1.5,0,0));
  if(renew&&i%12===0)handlers.get('cy2q')({op:'grip',id:drum.id,on:1},'peer');
  game.refreshHeldVisuals();game.updateRemoteHeldVisibility();mods.emit('update',1/60,game);
 }
 keys.clear();
}
const nativeSpawn=(ty,extra={})=>game.items.get(game.items.hostSpawn(ty,game.player.pos.clone().add(new THREE.Vector3(0,1,0)),{value:180,tier:'common',...extra}));
const drum=nativeSpawn('replydrum27',{holder:'host'});game.player.slot=0;game.refreshHeldVisuals();
let overlapping=null;
try{
 for(const d of SALVAGE27_ITEMS){assert.equal(ITEMS[d.id].kind,d.kind);for(const lang of ['tr','ru'])for(const key of ['name','tip'])assert.notEqual(tIn(lang,d[key]),d[key]);}
 for(const [k,old]of Object.entries(unchanged))assert.equal(JSON.stringify([SCRAP_TABLE[k],BIG_TABLES[k]]),old,'beginner and liminal pools untouched');
 for(const [tables,extras]of [[SCRAP_TABLE,SALVAGE27_SCRAP],[BIG_TABLES,SALVAGE27_BIG]])for(const [theme,rows]of Object.entries(extras))for(const [id,w]of rows)assert.deepEqual(tables[theme].filter(e=>e[0]===id),[[id,w]]);
 frames(150,{walk:true});assert(game.player.grounded&&game.player.hSpeed>1,'actual controller walks native weighted salvage');assert.equal(soundRows().length,0,'normal solo walking is quiet');
 const begin=game.time;frames(180,{walk:true,sprint:true});assert(soundRows().length>0,'actual weighted sprint emits native sound');
 const rows=soundRows().filter(r=>r.at>=begin);for(let i=1;i<rows.length;i++)assert(rows[i].at-rows[i-1].at>=C.itemGap-1e-8);
 assert.equal(pressure,soundRows().length,'exactly one native noise pressure charge per pulse');
 const heard=game.creatures.hear({pos:game.player.pos.clone(),def:{},zone:'out'},30);assert(heard&&heard.loud===C.loud&&heard.owner==='host','native hearing consumes emitted crew noise');
 assert.equal(game.creatures.host.size,0,'noise behaviour never directly spawns a creature');
 let count=soundRows().length;peer.setHeld(null);peer.pos.copy(game.player.pos).add(new THREE.Vector3(1.5,0,0));
 handlers.get('cy2q')({op:'grip',id:drum.id,on:1},'peer');assert.equal(game.carry2.helperFor(drum.id),'peer','actual host helper request admitted');
 frames(130,{walk:true,sprint:true,follow:true,renew:true});assert.equal(soundRows().length,count,'valid renewed two-person carry silences the drum');
 downed.add('peer');assert.equal(game.carry2.helperFor(drum.id),null);frames(35,{walk:true,sprint:true,follow:true});assert(soundRows().length>count,'a downed helper cannot grant silence');downed.clear();
 count=soundRows().length;game.net.broadcast('it',{e:'inv',h:'host',mv:[[drum.id,{k:'bag',x:0,y:0}]]});
 frames(150,{walk:true,sprint:true});assert.equal(soundRows().length,count,'native bag custody stays quiet');
 game.net.broadcast('it',{e:'inv',h:'host',mv:[[drum.id,null]]});game.net.broadcast('it',{e:'held',id:drum.id,h:'host',sl:0});game.player.slot=1;
 frames(130,{walk:true,sprint:true});assert.equal(soundRows().length,count,'inactive hotbar slot stays quiet');
 game.player.slot=0;game.refreshHeldVisuals();assert(loadable(drum,'host',[],id=>game.items.get(id)),'native trolley accepts signature salvage');
 game.net.broadcast('it',{e:'held',id:drum.id,h:CUSTODY,sl:0});drum.obj.visible=true;
 frames(150,{walk:true,sprint:true});assert.equal(soundRows().length,count,'native c:cargo13 custody stays silent even while visibly rendered');
 // Native loose body spin is independent of carrier slots and uses the existing
 // spatial sound / normal hearing path. Real Rapier velocities are the input.
 game.net.broadcast('it',{e:'drop',id:drum.id,p:[-10,3,10],q:[0,0,0,1],lv:[0,0,0]});drum.makeBody();drum.body.setAngvel({x:0,y:8,z:0},true);
 game.time+=.12;mods.emit('update',.12,game);assert(soundRows().length>count,'real loose angular velocity rattles');
 count=soundRows().length;game.isHost=false;game.time+=2;mods.emit('update',.2,game);assert.equal(soundRows().length,count);assert.equal(api.stats().tracked,0,'replica owns no sound queue');
 game.isHost=true;game.net.hostEpoch++;mods.emit('hostMigrated',game,{});drum.body.setAngvel({x:0,y:0,z:0},true);game.time+=.12;mods.emit('update',.12,game);assert.equal(soundRows().length,count,'migration does not replay queued pulses');
 drum.body.setAngvel({x:0,y:8,z:0},true);mods.emit('facilityWillChange',game.world,game);game.time+=2;mods.emit('update',.2,game);assert.equal(soundRows().length,count,'streaming suppresses outgoing loose bodies');
 game.world.facility={layout:{theme:'hospital',seed:28}};drum.body.setAngvel({x:0,y:0,z:0},true);mods.emit('facilityChanged',game.world,game);game.time+=.12;mods.emit('update',.12,game);assert.equal(soundRows().length,count,'rebuild does not retain old held displacement');
 game.run.phase='deadletter';drum.body.setAngvel({x:0,y:8,z:0},true);game.time+=2;mods.emit('update',.2,game);assert.equal(soundRows().length,count,'separate combat mode suppresses campaign noise');
 game.run.phase='moon';game.run.descent21={depth:1,token:'old:run:token'};game.time+=2;mods.emit('update',.2,game);assert.equal(soundRows().length,count,'new run rejects stale deep-floor token');delete game.run.descent21;
 // Real RemotePlayer PS parsing/pose plus native item custody provide active
 // type truth. A packet alone cannot make someone else's or a bagged item loud.
 game.net.broadcast('it',{e:'held',id:drum.id,h:'peer',sl:0});
 function remoteFrames(n){for(let i=0;i<n;i++){
  game.time+=.12;peer.applyState({p:peer.pos.clone().add(new THREE.Vector3(.4,0,0)).toArray(),y:0,pt:0,f:2,h:'replydrum27'});peer.update(.12);physics.step(1/60);game.updateRemoteHeldVisibility();mods.emit('update',.12,game);
 }}
 remoteFrames(25);assert(soundRows().length>count,'actual remote active type and moving position emit noise');count=soundRows().length;
 const duplicate=nativeSpawn('replydrum27',{holder:'peer'});remoteFrames(20);assert.equal(soundRows().length,count,'ambiguous same-type remote slots fail quiet');game.net.broadcast('it',{e:'rm',id:duplicate.id});
 game.net.broadcast('it',{e:'drop',id:drum.id,p:[-10,3,10],q:[0,0,0,1],lv:[0,0,0]});drum.makeBody();drum.body.setAngvel({x:0,y:0,z:0},true);
 // A hostile checkpoint with many native spinning props still cannot create
 // unbounded per-frame audio, native noise calls or temporal tracking state.
 const extras=[];for(let i=0;i<C.maxTracked+6;i++){const it=nativeSpawn('replydrum27');it.body.setAngvel({x:0,y:8,z:0},true);extras.push(it);}
 const budgetStart=game.time;for(let i=0;i<12;i++){game.time+=.12;mods.emit('update',.12,game);}
 const bounded=soundRows().filter(r=>r.at>budgetStart);assert(bounded.length>0);for(let i=1;i<bounded.length;i++)assert(bounded[i].at-bounded[i-1].at>=C.globalGap-1e-8);
 assert(api.stats().tracked<=C.maxTracked);for(const it of extras)game.net.broadcast('it',{e:'rm',id:it.id});
 // Native WorldItem centres the authored silhouette, then real cuboid/mass
 // creation uses that exact bound. No extra emitter or hidden oversized volume.
 for(const def of SALVAGE27_ITEMS){
  const it=nativeSpawn(def.id),rotation=it.obj.quaternion.clone();
  // A world AABB widens with stock random spawn yaw; the native physical
  // cuboid uses centred model-local dimensions, not that rotated AABB.
  it.obj.quaternion.identity();it.obj.updateMatrixWorld(true);
  const bb=new THREE.Box3().setFromObject(it.obj),size=bb.getSize(new THREE.Vector3());
  it.obj.quaternion.copy(rotation);it.obj.updateMatrixWorld(true);
  assert(size.distanceTo(it.size)<1e-6);assert(size.x<=.86&&size.y<=1.23&&size.z<=.51);
  let meshes=0;it.obj.traverse(o=>{assert(!o.isLight);if(o.isMesh){meshes++;assert.equal(o.material.type,'MeshLambertMaterial');assert.equal(o.material.emissive.getHex(),0);assert(o.geometry.attributes.position.count<2200);}});assert.equal(meshes,1);
  assert(it.body&&it.col,'actual native body and cuboid exist');
  assert(new THREE.Vector3(it.col.shape.halfExtents.x,it.col.shape.halfExtents.y,it.col.shape.halfExtents.z).distanceTo(it.size.clone().multiplyScalar(.5))<1e-6,'real Rapier cuboid matches local visual bounds');
  if(def.kind==='big')assert(Math.abs(it.body.mass()-def.mass)<.02,'native indexed glass mass remains12');
  const record=game.items.serialize().find(e=>e.id===it.id);assert.equal(record.ty,def.id);assert.equal(record.v,it.value);assert.equal(record.h,null);
  const before=it.value;game.onItemImpact(it,8);assert.equal(it.value<before,!!def.fragile,'normal fragile impacts apply; robust sorter does not add breakage');
  game.net.broadcast('it',{e:'rm',id:it.id});
 }
 assert(hints.some(h=>h[0].includes('Reply Drum')),'one existing toast explains the noise decision');
 assert.equal(errLog.total,errorsBefore,'actual emitter callbacks raised no caught errors');
 assert(salvage27ModelStats().templates<=3&&salvage27ModelStats().materials===1);
 overlapping=installSalvage27({...game,mods:new Emitter()});assert.equal(salvage27ModelStats().leases,2);
 console.log('salvage27: native weighted walking/sprint, real helper, custody, spin/hearing, migration/stream/mode, three one-batch physical models pass');
}finally{
 game.items.clearAll();game.items.dispose();api.dispose();api.dispose();overlapping?.dispose();game.carry2.dispose();peer.dispose();game.player.destroy();physics.dispose();
 for(const def of SALVAGE27_ITEMS)assert(!window.__kefalMods.itemModels.has(def.id),'old session factory must not be resurrected by overlapping teardown');
 assert.deepEqual(salvage27ModelStats(),{leases:0,templates:0,materials:0});
}
