// Real manager, native helpers and Session self-delivery; no simulation outcome replacement.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as THREE from 'three';
import {CreatureManager} from '../../src/entities/creatures.js';
import {CREATURES} from '../../src/game/creatures.js';
import {hostMethods} from '../../src/game/host.js';
import {Session} from '../../src/net/session.js';
import {Emitter,errLog} from '../../src/core/events.js';
import {creatureOptsFromView,buildX,hostDataFrom} from '../../src/game/hostmig_core.js';
import {installHostMig} from '../../src/game/hostmig.js';
import {installCrdirector} from '../../src/game/crdirector.js';
import {newSquad,registerWave1Content} from '../../src/game/creatures_wave1.js';
import {registerHordeModels} from '../../src/models/creatures_wave1.js';
const moduleURL=new URL('../../src/game/density35.js',import.meta.url);
globalThis.window={__kefalMods:{creatureModels:new Map()},KefalAPI:{THREE}};
const install=existsSync(moduleURL)?(await import(moduleURL)).installDensity35:()=>({dispose(){}});
const pos=new THREE.Vector3(70,-300,0), failures=[];
function fixture({day=2,q=0,time=0}={}){
 const net=new Session({strategy:'local',isHost:true,code:'D35',profile:{}});net.selfId='host';net.hostId='host';
 const game={isHost:true,net,mods:new Emitter(),time:0,run:{phase:'moon',moon:'hamsi',seed:1235,day,quotaIndex:q,time:480},hostData:{moonT:time,powerUsed:0,outPowerUsed:0},engine:{scene:new THREE.Scene()},config:{dangerMul:1},profile:{name:'crew'},remotes:new Map(),world:{facility:{layout:{theme:'factory',seed:1235,y:-300},ventSpots:[{x:70,y:-300,z:0}],ceilingSpots:[{x:70,y:-297,z:0}],scrapSpots:[],mainDoor:{spawn:new THREE.Vector3(0,-300,0)}}},aiPlayers:()=>[],rollLevel:()=>1,rollElite:()=>false,hostEarlySafeFilter:()=>null};
 game.creatures=new CreatureManager(game);const events=[];
 net.on_('cev',d=>{events.push(d);game.creatures.onEvent(d);game.onEvent?.(d);});
 game.broadcastRun=hostMethods.broadcastRun;
 game.hostSpawnCreatureIndoor=hostMethods.hostSpawnCreatureIndoor;game.hostSpawnOutdoor=hostMethods.hostSpawnOutdoor;
 game.density35=install(game);
 const spawn=(type='scuttler',opts={})=>game.creatures.hostSpawn(type,pos,{zone:'in',variant:null,affix:null,...opts});
 return{game,spawn,events,setTime(t){game.hostData.moonT=t;},dispose(){game.density35.dispose();game.creatures.clearAll();net.leave();}};
}
function check(name,fn,options){const f=fixture(options);try{fn(f);console.log('PASS',name);}catch(e){failures.push(name);console.error('FAIL',name,e.message.slice(0,220));}finally{f.dispose();}}
check('first landing quiet then one shared living roamer',({game,spawn,setTime,events})=>{
 assert.ok(spawn()===null,'no ordinary spawn during first landing grace');assert.equal(events.length,0);
 setTime(119.9);assert.ok(spawn('crawler',{id:'new-firstsight',data:{fs:1}})===null,'fresh explicit ID is not migration');
 setTime(120);const c=spawn();assert(c);setTime(200);assert.ok(spawn('hound',{zone:'out'})===null);assert.equal(game.creatures.host.size,1);c.dead=true;assert(spawn());
},{day:1});
check('later grace and cooldown cover metadata and scripted requests',({spawn,setTime})=>{
 setTime(59.9);assert.ok(spawn('crawler',{data:{closet:'native'},scripted:true})===null);
 setTime(60);assert(spawn());setTime(104.9);assert.ok(spawn()===null);setTime(105);assert(spawn());setTime(150);assert.ok(spawn()===null);
});
for(const [q,cap] of [[0,2],[1,2],[2,3],[3,3],[4,4],[9,4]])check(`quota ${q} sleeping and remote bodies fill shared cap`,({game,spawn,setTime})=>{
 for(let i=0;i<cap;i++){setTime(60+i*45);const c=spawn('scuttler',{state:i?'hidden':'idle',zone:i%2?'out':'in'});assert(c);c.pos.x=1000+i;}
 setTime(600);assert.ok(spawn()===null);assert.equal(game.creatures.host.size,cap);
},{q});
check('recursive Session delivery cannot over-admit and removed success consumes cooldown',({game,spawn,setTime})=>{
 setTime(60);let recursive='unset';game.onEvent=d=>{if(d.e==='sp'){game.onEvent=null;game.creatures.hostRemove(d.id);recursive=spawn();}};
 const c=spawn();assert(c);assert.ok(recursive===null);assert.equal(game.creatures.host.size,0);game.onEvent=null;
 setTime(104.9);assert.ok(spawn()===null);setTime(105);assert(spawn());
});
check('native decline and constructor throw release pending admission',({game,spawn,setTime})=>{
 setTime(60);game.descentThreat21={allowSpawn:()=>false};assert.ok(spawn()===null);delete game.descentThreat21;
 game.forge={creatureOpts(){throw new Error('fixture forge failure');}};assert.throws(()=>spawn(),/fixture forge failure/);delete game.forge;assert(spawn());
});
check('native pack and leech helpers report full refusal and accepted partial pack',({game,setTime})=>{
 assert.equal(game.hostSpawnCreatureIndoor('scuttler'),false);assert.equal(game.hostSpawnCreatureIndoor('leech'),false);
 setTime(60);assert.equal(game.hostSpawnCreatureIndoor('scuttler'),true);assert.equal(game.creatures.host.size,1);assert.equal(game.hostSpawnCreatureIndoor('scuttler'),false);
});
check('native outdoor rejected attempt refunds power; admitted pack retains original cost',({game,setTime})=>{
 const old=Math.random;Math.random=()=>.01;try{
  game.hostSpawnOutdoor();assert.equal(game.hostData.outPowerUsed,0);assert.equal(game.creatures.host.size,0);
  setTime(60);game.hostSpawnOutdoor();assert.equal(game.creatures.host.size,1);const c=[...game.creatures.host.values()][0];assert.equal(game.hostData.outPowerUsed,c.def.power);
 }finally{Math.random=old;}
});
check('native view migration restores over cap without treating fresh id as restored',({game,spawn,setTime})=>{
 game.density35.dispose();const original=[];for(let i=0;i<4;i++)original.push(spawn());game.density35=install(game);game.creatures.host.clear();
 game.hostData=hostDataFrom(buildX({...game.hostData,moonT:10},game.run,{},[],0),game.run,[],()=>({}));
 for(const v of game.creatures.views.values()){const c=game.creatures.hostSpawn(v.type,v.target.clone(),creatureOptsFromView(v));assert(c);assert.equal(c.id,v.id);}
 assert.deepEqual([...game.creatures.host.keys()],original.map(c=>c.id));assert.ok(spawn('crawler',{id:'fresh-id'})===null);setTime(600);assert.ok(spawn()===null);
});
check('facility arrival grace and lower native depth cap',({game,spawn,setTime})=>{
 game.run.descent21={depth:3};game.descentThreat21={spec:()=>({liminal:true,threat:{maxAlive:2}})};
 setTime(300);game.mods.emit('facilityChanged',game.world,game,3);assert.ok(spawn()===null);setTime(389.9);assert.ok(spawn()===null);setTime(390);assert(spawn());setTime(435);assert(spawn());setTime(480);assert.ok(spawn()===null);
},{q:4});
check('dispose and new landing retain existing actors and clear obsolete pacing',({game,spawn,setTime})=>{
 setTime(60);const c=spawn();assert(c);game.run={...game.run,day:3,seed:99};setTime(0);assert.ok(spawn()===null);assert.equal(game.creatures.host.get(c.id),c);
 game.density35.dispose();game.density35.dispose();assert(spawn());
});
check('real native host migration promotes peer and preserves over-cap views',({game,spawn})=>{
 game.density35.dispose();for(let i=0;i<4;i++)assert(spawn());game.density35=install(game);game.creatures.host.clear();
 game.net.isHost=false;game.net.hostId='old-host';Object.defineProperty(game,'isHost',{get:()=>game.net.isHost});
 game.items={all:()=>[],nextId:1};game.freshDayStats=()=>({});game.registerHandlers=()=>{};game.hostOnPlayerLeave=()=>{};
 let info;game.mods.on('hostMigrated',(g,d)=>{info=d;});
 const migration=installHostMig(game);
 try{
  game.net.receive({t:'hmx',d:buildX({...game.hostData,moonT:10},game.run,{},['old-host','host'],0)},'old-host');
  migration.becomeHost();assert(game.isHost);assert.equal(info.creatures,4);assert.deepEqual(info.degraded,[]);assert.equal(game.creatures.host.size,4);assert.ok(spawn()===null);
 }finally{migration.dispose();}
});
check('only a real living boss owner exempts minions, unrelated metadata stays bounded',({game,spawn})=>{
 const original=CREATURES.crawler;CREATURES.crawler={...original,boss:true};
 try{const boss=spawn('crawler');assert(boss);assert(spawn('scuttler',{data:{owner:boss.id}}));assert.ok(spawn('scuttler',{data:{owner:'fake'}})===null);boss.dead=true;assert.ok(spawn('scuttler',{data:{owner:boss.id}})===null);}
 finally{CREATURES.crawler=original;}
});
check('harmless native web and damaging hazard retain native owners',({spawn})=>{assert(spawn('web',{data:{owner:'spider'}}));assert(spawn('mine'));assert.ok(spawn('scuttler',{data:{nest:'web'}})===null);});
check('disposed module and authored active mode bypass only their own admission',({game,spawn})=>{
 game.deadletter24={active:()=>true,spawnOptions:(type,pos,opts)=>opts};assert(spawn());delete game.deadletter24;assert.ok(spawn()===null);
});
check('native wave charged once for accepted partial pack and zero for full denial',({game,setTime})=>{
 game.indoorBudget=()=>10;game.hostSpawnWave=hostMethods.hostSpawnWave;
 const old=Math.random;Math.random=()=>.001;try{game.hostSpawnWave(1);assert.equal(game.hostData.powerUsed,0);setTime(60);game.hostSpawnWave(1);assert.equal(game.creatures.host.size,1);assert.equal(game.hostData.powerUsed,.5);game.hostSpawnWave(1);assert.equal(game.hostData.powerUsed,.5);}finally{Math.random=old;}
});
check('native outdoor construction failure refunds power and releases admission',({game,spawn,setTime})=>{
 setTime(60);const old=Math.random;Math.random=()=>.01;game.forge={creatureOpts(){throw new Error('fixture outdoor failure');}};
 try{assert.throws(()=>game.hostSpawnOutdoor(),/fixture outdoor failure/);assert.equal(game.hostData.outPowerUsed,0);}finally{Math.random=old;delete game.forge;}assert(spawn());
});
check('receipt replicated through real Session preserves cooldown after native removal',({game,spawn,setTime})=>{
 const peer=fixture();try{
  peer.game.net.isHost=false;peer.game.isHost=false;peer.game.net.selfId='peer';peer.game.net.hostId='host';
  peer.game.net.on_('gs',d=>Object.assign(peer.game.run,structuredClone(d)));
  const nativeBroadcast=game.net.broadcast.bind(game.net);game.net.broadcast=(t,d,self)=>{nativeBroadcast(t,d,self);peer.game.net.receive({t,d:structuredClone(d)},'host');};
  setTime(60);const c=spawn();assert(c);assert(peer.game.creatures.views.has(c.id));game.creatures.hostRemove(c.id);assert.equal(peer.game.creatures.views.size,0);
  peer.game.isHost=true;peer.game.net.isHost=true;peer.setTime(104);assert.ok(peer.spawn()===null);peer.setTime(105);assert(peer.spawn());
 }finally{peer.dispose();}
});
check('deep receipt survives same-floor rebuild and later floor starts a fresh grace',({game,spawn,setTime})=>{
 game.run.descent21={depth:1};game.descentThreat21={spec:()=>({liminal:false,threat:{maxAlive:2}})};
 setTime(200);game.mods.emit('facilityChanged',game.world,game,1);setTime(259.9);assert.ok(spawn()===null);setTime(260);const c=spawn();assert(c);game.creatures.hostRemove(c.id);
 game.world.facility={...game.world.facility};game.mods.emit('facilityChanged',game.world,game,1);setTime(305);assert(spawn());
 game.run.descent21.depth=2;game.mods.emit('facilityWillChange',game.world,game,2);assert.ok(spawn()===null);game.mods.emit('facilityChanged',game.world,game,2);setTime(364.9);assert.ok(spawn()===null);setTime(365);assert(spawn());
});
check('actual creature director cannot charge queued denials or rush landing grace',({game,setTime})=>{
 game.indoorBudget=()=>10;game.hostSpawnWave=hostMethods.hostSpawnWave;game.hostPopulateMoon=function(){this.hostSpawnWave(1);};
 game.aiPlayers=()=>[{id:'crew',pos:new THREE.Vector3(0,-300,0),zone:'in',dead:false,inShip:false}];
 const director=game.crdirector=installCrdirector(game),old=Math.random;Math.random=()=>.001;
 try{
  game.hostPopulateMoon();assert.equal(game.hostData.powerUsed,0,'queued requests are not admitted bodies');
  game.hostData.pressureStage=3;for(let t=1;t<60;t++){setTime(t);game.mods.emit('update',1,game);}assert.equal(game.creatures.host.size,0);assert.equal(game.hostData.powerUsed,0);
  setTime(60);game.hostSpawnWave(1);assert.equal(game.hostData.powerUsed,0,'enqueue itself spends no power');
  for(let t=60;t<105;t++){setTime(t);game.mods.emit('update',1,game);}
  assert.equal(game.creatures.host.size,1,'a real queued helper eventually admits one actor');assert.equal(game.hostData.powerUsed,.5,'only the successful native body spends power');
 }finally{Math.random=old;director.dispose();}
});
check('degraded migration clock rollback cannot strand fresh spawns for an old landing duration',({game,spawn,setTime})=>{
 setTime(600);const c=spawn();assert(c);game.creatures.hostRemove(c.id);setTime(100);game.mods.emit('hostMigrated',game,{self:true,degraded:['hostData']});
 setTime(144.9);assert.ok(spawn()===null);setTime(145);assert(spawn(),'degraded snapshot retains one cooldown, not the old absolute clock');
});
check('known native squad and active mirror owner exempt only explicit encounter members',({game,spawn})=>{
 registerWave1Content();registerHordeModels();const squad=newSquad(1);
 assert.ok(spawn('hs_enforcer',{data:{squad:{},faction:1}})===null);
 assert(spawn('hs_enforcer',{data:{squad,faction:1}}));assert.ok(spawn('scuttler',{data:{squad,faction:1}})===null);
 assert.ok(spawn('crawler',{data:{mirror:1}})===null);
 // Owner-state fixture uses the native mirror hostM shape; no mirror combat completion is claimed.
 game.mirror={S:{hostM:new Map([['crew',{id:'crew',dead:false}]])}};
 assert(spawn('crawler',{data:{mirror:1}}));assert.ok(spawn('crawler',{data:{closet:'mirror'}})===null);game.mirror.S.hostM.clear();assert.ok(spawn('crawler',{data:{mirror:1}})===null);
});
check('boss owner marker survives actual native promotion without filling ordinary cap',({game,spawn,setTime})=>{
 const original=CREATURES.crawler;CREATURES.crawler={...original,boss:true};let migration;
 try{
  setTime(60);const boss=spawn('crawler');assert(boss);const minions=[];for(let i=0;i<3;i++)minions.push(spawn('scuttler',{data:{owner:boss.id}}));
  for(const c of minions){assert(c);assert.equal(game.creatures.views.get(c.id).spawnData.bo,boss.id);assert.equal(game.creatures.serializeFor().find(row=>row.id===c.id).bo,boss.id);}
  assert(spawn());game.creatures.host.clear();game.net.isHost=false;game.net.hostId='old-host';Object.defineProperty(game,'isHost',{get:()=>game.net.isHost});
  game.items={all:()=>[],nextId:1};game.freshDayStats=()=>({});game.registerHandlers=()=>{};game.hostOnPlayerLeave=()=>{};
  migration=installHostMig(game);game.net.receive({t:'hmx',d:buildX({...game.hostData,moonT:180},game.run,{},['old-host','host'],0)},'old-host');migration.becomeHost();
  for(const c of minions)assert.equal(game.creatures.host.get(c.id).data.owner,boss.id);assert(spawn(),'minions still belong to the restored live boss');setTime(225);assert.ok(spawn()===null,'two ordinary actors still enforce quota cap');
 }finally{migration?.dispose();CREATURES.crawler=original;}
});
assert.equal(errLog.total,0,'native event processing did not swallow errors');
assert.equal(failures.length,0,`${failures.length} failed groups: ${failures.join('; ')}`);
console.log('density35: all native admission groups passed');
