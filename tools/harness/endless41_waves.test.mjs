// NATIVE_INTEGRATION: actual Terrain/Rapier, ship, CreatureManager, Session,
// first-floor/density gates and HostMig. Controlled native update clock and
// cockpit/field starting poses are labelled setup, not human gameplay.
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Physics,initPhysics,G} from '../../src/physics/physics.js';
import {Terrain,planMoon} from '../../src/world/terrain.js';
import {buildShip,insideShip} from '../../src/world/ship.js';
import {MOONS} from '../../src/game/moons.js';
import {SHIP} from '../../src/world/ship.js';
import {Session} from '../../src/net/session.js';
import {Emitter,errLog} from '../../src/core/events.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {installEndless41Waves} from '../../src/game/endless41_waves.js';
import {newEndless41,admitPlayer41} from '../../src/game/endless41_core.js';
import {installDensity35} from '../../src/game/density35.js';
import {installFirstDepth21} from '../../src/game/firstdepth21.js';
import {installHostMig} from '../../src/game/hostmig.js';
import {buildX} from '../../src/game/hostmig_core.js';
import {hostMethods} from '../../src/game/host.js';
import {registerHordeModels} from '../../src/models/creatures_wave1.js';

await initPhysics();
window.__kefalMods={creatureModels:new Map()};window.KefalAPI={THREE};registerHordeModels();
async function fixture(seed=4101){
 const physics=new Physics(),scene=new THREE.Scene(),ship=buildShip({physics,scene,lightPool:{add:x=>x}}),terrain=new Terrain(seed,MOONS.hamsi,planMoon(seed,MOONS.hamsi));
 terrain.buildCollider(physics);physics.step(1/30);
 const net=new Session({strategy:'local',isHost:true,code:'endless41-waves'});net.selfId=net.hostId='H';net.connected=true;
 for(const id of ['H','P'])net.players.set(id,{id,name:id});net.transport.peers.add('P');
 const mods=new Emitter(),timers=[],messages=[],xp=[],ordinary=[];let clock=0,seq=0;
 const player={id:'H',pos:new THREE.Vector3(-5.25,.05,.9),dead:false,downed:false,get inShip(){return insideShip(this.pos);}},remote={id:'P',pos:new THREE.Vector3(4,.05,1),dead:false,downed:false};
 const state=newEndless41('wave41-test-'+seed,seed);state.stage='field';admitPlayer41(state,'H','H');admitPlayer41(state,'P','P');
 const game={net,mods,physics,scene,engine:{scene},ship,player,remotes:new Map([['P',remote]]),run:{phase:'moon',moon:'hamsi',seed,day:1,quotaIndex:0,endless41:state},world:{moonId:'hamsi',seed,terrain,facility:{layout:{theme:'factory',y:-300,seed}}},hostData:{moonT:0},config:{},audio:{play:()=>null},time:0,selfId:'H',get isHost(){return net.isHost;},items:{all:()=>[],nextId:1},
  broadcastRun:hostMethods.broadcastRun,freshDayStats:()=>({}),registerHandlers(){},hostOnPlayerLeave(){},hostAnnounce(){},hostSave(){},markRunSent(){},
  later(fn,ms){timers.push({fn,at:clock+ms/1000,seq:seq++});return seq;},hostHurtPlayer(id,amount){ordinary.push(['hurt',id,amount]);},hostOnCreatureKilled(){ordinary.push(['reward']);},
  aiPlayers(){return[player,remote].map(p=>({...p,inShip:insideShip(p.pos),zone:'out',eye:p.pos.clone().add(new THREE.Vector3(0,1.62,0)),look:new THREE.Vector3(0,0,1)}));},
  aiPlayerById(id){return this.aiPlayers().find(p=>p.id===id);},
 };
 game.creatures=new CreatureManager(game);
 const waves=installEndless41Waves(game);
 game.endless41={active:()=>!!game.run.endless41,awardXp:(id,n)=>xp.push([id,n]),ownsCreature:waves.owns,...Object.fromEntries(['spawnOptions','afterSpawn','onKill','creatureTick','canMove'].map(k=>[k,waves[k]]))};
 game.density35=installDensity35(game);const first=installFirstDepth21(game);
 net.on_('cev',d=>game.creatures.onEvent(d));net.on_('gs',d=>Object.assign(game.run,d));net.on_('sys',d=>messages.push(d));
 mods.on('update',(dt,g)=>{if(g===game&&game.isHost)waves.tick(dt);});
 const step=dt=>{clock+=dt;game.time=clock;if(game.isHost&&game.hostData)game.hostData.moonT+=dt;physics.step(dt);mods.emit('update',dt,game);if(game.isHost)game.creatures.hostUpdate(dt);while(timers.some(t=>t.at<=clock)){timers.sort((a,b)=>a.at-b.at||a.seq-b.seq);timers.shift().fn();}};
 const advance=seconds=>{for(let i=0;i<Math.round(seconds*20);i++)step(.05);};
 return {game,waves,state,physics,net,mods,messages,xp,ordinary,advance,step,first,dispose(){waves.dispose();first.dispose();game.density35.dispose();game.creatures.clearAll();net.leave();physics.dispose();}};
}
let f=await fixture();
try{
 const {game,state,advance,messages,xp,ordinary}=f;
 assert.equal(game.creatures.hostSpawn('zombot',new THREE.Vector3(30,0,30),{data:{e41:{token:state.token,map:'hamsi:4101:1',wave:1,index:0,elite:false}}}),null,'forged same-context owner cannot spawn without issued native wave ticket');
 assert.equal(game.creatures.hostSpawn('spider',new THREE.Vector3(30,0,30)),null,'ordinary director cannot join mode-owned pool');
 advance(89.9);assert.equal(game.creatures.host.size,0);assert.equal(messages.length,0,'90-second grace contains no surprise warning');
 advance(.15);assert.equal(state.waveWarning?.wave,1,'first native warning is visible after grace');assert.equal(state.wave,0);assert.equal(game.creatures.host.size,0);
 assert.equal(messages.length,1);advance(5.8);assert.equal(game.creatures.host.size,0,'warning lasts six seconds before actor creation');
 game.forge={creatureOpts(){throw new Error('normal forge must not tune mode actor');}};
 game.descentThreat21={allowSpawn(){throw new Error('normal descent must not reject mode actor');},limit(){throw new Error('normal descent must not tune mode actor');}};
 advance(1.7);
 assert.equal(state.wave,1);assert.equal(game.creatures.host.size,2,'first native wave admits exactly two through real density/first-floor wrappers');
 const actors=[...game.creatures.host.values()];
 for(const c of actors){assert.equal(c.def.run,1.1);assert.equal(c.coin,0);assert.equal(c.xp,0);assert.equal(c.zone,'out');assert(Math.hypot(c.home.x,c.home.z)>=18);assert(game.aiPlayers().every(p=>Math.hypot(c.home.x-p.pos.x,c.home.z-p.pos.z)>=20));assert.equal(game.creatures.views.get(c.id).spawnData.e41.token,state.token);}
 state.revision+=1;assert(f.waves.owns(actors[0]),'temporary spending revision cannot orphan native actor');
 game.creatures.damage(actors[0].id,4,'P');game.creatures.damage(actors[0].id,1000,'H');
 assert.deepEqual(xp,[['H',18],['P',9]],'native kill rewards known killer and actual assistant through run XP only');
 game.creatures.kill(actors[0],'H');assert.equal(xp.length,2,'native repeated kill cannot reward twice');assert(!ordinary.some(e=>e[0]==='reward'));
 game.creatures.damage(actors[1].id,1000,'H');advance(2);
 assert.equal(state.stage,'break');assert.equal(state.kills,2);
 advance(68);assert.equal(state.waveWarning?.wave,2);assert.equal(state.wave,1);advance(7.5);
 assert.equal(state.wave,2);assert.equal([...game.creatures.host.values()].filter(c=>!c.dead).length,4,'second wave stays manageable with four actors');
 const second=[...game.creatures.host.values()].filter(c=>!c.dead),beforeUnknown=xp.length;
 game.creatures.damage(second[0].id,1000,'unknown-owner');assert.equal(xp.length,beforeUnknown,'unknown pseudo killer cannot create run XP');
 state.turretOwner='H';game.creatures.damage(second[1].id,1000,'sytur');assert.deepEqual(xp.at(-1),['H',18],'actual native shipyard turret kill credits its known living buyer');assert.equal(xp.length,beforeUnknown+1);
 state.turretOwner='P';game.remotes.get('P').dead=true;game.creatures.damage(second[2].id,1000,'sytur');assert.equal(xp.length,beforeUnknown+1,'dead turret buyer cannot create run XP');game.remotes.get('P').dead=false;
 game.creatures.damage(second[3].id,1000,'H');
 advance(240.2-state.elapsed);assert.equal(state.waveWarning?.wave,3);advance(14);
 const third=[...game.creatures.host.values()].filter(c=>!c.dead);assert.equal(third.length,6,'third native batch is six');assert(third.every(c=>!c.data.e41.elite));third.forEach(c=>game.creatures.damage(c.id,1000,'H'));
 advance(315.2-state.elapsed);assert.equal(state.waveWarning?.wave,4);advance(17);
 const fourth=[...game.creatures.host.values()].filter(c=>!c.dead);assert.equal(fourth.length,8);assert.equal(fourth.filter(c=>c.data.e41.elite).length,1,'fourth native batch has exactly one elite');assert.equal(fourth.filter(c=>c.type==='spider').length,2);assert(fourth.every(c=>c.def.run<=2.3&&c.dmg<=24&&c.maxHp<=170));
 console.log('PASS Endless native grace/warning/spawn admission, count/stat bounds, run-only XP and ordinary gate exclusion');
}finally{f.dispose();}
f=await fixture(4102);
try{
 const {game,state,advance,net}=f;advance(97.4);const c=[...game.creatures.host.values()][0];assert(c);
 const start=c.pos.clone();advance(5);assert(c.pos.distanceTo(start)>1,'native actor moves through the single CreatureManager clock');
 // Place a real wall across this actor's next native step. Setup pose is a
 // boundary probe; accepted field routes never get repaired by teleport.
 const destination=c.pos.clone().add(new THREE.Vector3(.4,0,0)),wall=f.physics.addStaticBox(destination.x,destination.y+1,destination.z,.15,1,.6);f.physics.step(1/30);
 assert.equal(f.waves.canMove(c,destination.x,destination.z),false);const blocked=c.pos.clone();game.creatures.placeAt(c,destination.x,destination.z);assert.deepEqual(c.pos.toArray(),blocked.toArray(),'native mode step cannot enter static wall');
 f.physics.removeCollider(wall);f.physics.step(1/30);
 const records=game.creatures.serializeFor();assert(records.every(r=>r.e41?.token===state.token),'late-join native serialization retains bounded wave ownership');
 game.creatures.host.delete(c.id);assert.ok(game.creatures.hostSpawn(c.type,c.pos.clone().add(new THREE.Vector3(10,0,0)),{id:c.id})===null,'a retained native view does not authorize a different restored position');game.creatures.host.set(c.id,c);
 net.isHost=false;net.hostId='old';net.players.set('old',{id:'old'});net.transport.peers.add('old');game.creatures.host.clear();
 const migration=installHostMig(game);let migrated;f.mods.on('hostMigrated',(_,info)=>{migrated=info;});
 try{net.receive({t:'hmx',d:buildX(game.hostData,game.run,{},['old','H','P'],0)},'old');migration.becomeHost();assert.equal(migrated.creatures,2);assert.deepEqual(migrated.degraded,[]);assert([...game.creatures.host.values()].every(f.waves.owns));const elapsed=state.elapsed,wave=state.wave;advance(.5);assert(state.elapsed>elapsed);assert.equal(state.wave,wave,'migration resumes ledger without another opening wave');}finally{migration.dispose();}
 const current=[...game.creatures.host.values()][0],hp=state.shipHp;
 state.stage='over';const at=current.pos.clone();advance(4);assert.deepEqual(current.pos.toArray(),at.toArray());assert.equal(state.shipHp,hp,'over stage halts movement and ship damage');
 game.run.seed++;game.world.seed=game.run.seed;f.mods.emit('mapLoaded',game.world,game);assert.equal(game.creatures.host.size,0,'new native map removes stale owned actors safely');
 console.log('PASS Endless native movement/static boundary, late-join receipt, actual HostMig reconstruction and over/map cleanup');
}finally{f.dispose();}
f=await fixture(4103);
try{
 const {game,state,advance,ordinary}=f;advance(97.4);
 const c=[...game.creatures.host.values()][0],initial=c.pos.clone();assert(c);
 // A revivable peer can omit its downed flag in aiPlayers; the native rescue
 // ledger remains authoritative. Nearby pose is labelled boundary setup.
 game.remotes.get('P').pos.copy(c.pos).add(new THREE.Vector3(.7,0,0));
 const beforeHealthy=ordinary.filter(e=>e[0]==='hurt').length;advance(2);
 assert(ordinary.filter(e=>e[0]==='hurt').length>beforeHealthy,'the same physical pose admits a healthy peer attack');
 game.downed={isDowned:id=>id==='P'};
 const hurt=ordinary.filter(e=>e[0]==='hurt').length;advance(2.2);
 assert.equal(ordinary.filter(e=>e[0]==='hurt').length,hurt,'mode creatures do not hunt a revivable body');
 game.remotes.get('P').pos.set(4,.05,1);game.downed=null;
 advance(43);
 assert(state.shipHp<300,'native actors walk from certified warning region into physical exterior door strike range');
 assert(c.pos.distanceTo(initial)>20,'ship strike follows native movement rather than an injected arrival');
 const before=state.shipHp;advance(.5);assert(before-state.shipHp<=12,'shared ship damage admission is bounded to one strike per second');
 const obstruction=f.physics.addStaticBox(SHIP.door.x,.7,SHIP.z1+.55,.8,1,.8);f.physics.step(1/30);
 const protectedHp=state.shipHp;advance(4);assert.equal(state.shipHp,protectedHp,'actual static obstruction blocks exterior door strike LOS');
 f.physics.removeCollider(obstruction);f.physics.step(1/30);advance(4);assert(state.shipHp<protectedHp,'removing the same obstruction admits physical ship strikes again');
 console.log('PASS Endless native exterior ship approach/damage bounds and rescue-ledger target exclusion');
}finally{f.dispose();}
f=await fixture(4104);
try{
 const {game,state,advance,net}=f;advance(96.2);assert.equal(game.creatures.host.size,1);assert.equal(state.waveWarning.spawned,1);
 // Replication-gap setup: the latest native spawn view arrived after the last
 // half-second run keyframe. Keep its receipt, with the older pending counter.
 state.waveWarning.spawned=0;net.isHost=false;net.hostId='old';net.players.set('old',{id:'old'});net.transport.peers.add('old');game.creatures.host.clear();
 const migration=installHostMig(game);
 try{
  net.receive({t:'hmx',d:buildX(game.hostData,game.run,{},['old','H','P'],0)},'old');migration.becomeHost();
  assert.equal(state.waveWarning.spawned,1,'actual migration reconciles pending batch progress from accepted native views');
  advance(4);assert.equal(game.creatures.host.size,2);assert.deepEqual([...game.creatures.host.values()].map(c=>c.data.e41.index).sort(),[0,1],'migration cannot duplicate an already replicated wave slot');
  const elapsed=state.elapsed,hp=state.shipHp;
  net.receive({t:'hmclaim',d:{e:net.hostEpoch,k:1,r:0,o:['P','H']}},'P');assert.equal(game.isHost,false,'actual accepted host claim demotes this director');
  advance(8);assert.equal(state.elapsed,elapsed);assert.equal(state.shipHp,hp);assert.equal(f.waves.spawnOptions('zombot',new THREE.Vector3(30,0,30),{}),false);
 }finally{migration.dispose();}
 console.log('PASS Endless actual partial-wave migration reconciliation and accepted demotion clock/damage/spawn freeze');
}finally{f.dispose();}
f=await fixture(4105);
try{
 const {game,state,advance}=f,z=SHIP.z1+3.5,y=game.world.terrain.heightAt(SHIP.door.x,z),wall=f.physics.addStaticBox(SHIP.door.x,y+2,z,3,2,3);f.physics.step(1/30);
 let queries=0;const raycast=f.physics.raycast;f.physics.raycast=function(...args){queries++;return raycast.apply(this,args);};
 try{advance(90.05);assert(queries>0);assert.equal(state.waveWarning,undefined);const attempts=queries;advance(1);assert.equal(queries,attempts,'unavailable physical approach retries on a bounded cadence rather than every host frame');assert.equal(game.creatures.host.size,0);}finally{f.physics.raycast=raycast;f.physics.removeCollider(wall);}
 console.log('PASS Endless unavailable physical approach keeps grace/spawn safety and bounded native search cadence');
}finally{f.dispose();}
assert.equal(errLog.total,0,'native Session callbacks have no swallowed error');
