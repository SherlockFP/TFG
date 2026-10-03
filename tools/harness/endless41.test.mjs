import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {initPhysics,Physics,G} from '../../src/physics/physics.js';
import {buildShip} from '../../src/world/ship.js';
import {Session} from '../../src/net/session.js';
import {Emitter,errLog} from '../../src/core/events.js';
import {RemotePlayer} from '../../src/entities/remote.js';
import {ItemManager} from '../../src/entities/items.js';
import {hostMethods} from '../../src/game/host.js';
import {defaultProfile,saveProfile} from '../../src/core/save.js';
import {sessionProfile41,newEndless41,admitPlayer41,starterShip41} from '../../src/game/endless41_core.js';
import {installEndless41} from '../../src/game/endless41.js';
import {effects} from '../../src/game/shipyard_core.js';
await initPhysics();window.__kefalMods={itemModels:new Map()};
const writes=[];localStorage.setItem=(k,v)=>writes.push({k,v});
const original={...defaultProfile(),id:'owner41'},before=structuredClone(original),profile=sessionProfile41(original,{host:true,mode:'endless'});
const physics=new Physics(),scene=new THREE.Scene(),ship=buildShip({scene,physics,lightPool:{add:e=>e,remove(){}}});
const net=new Session({strategy:'local',isHost:true,code:'ENDLESS41'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
const mods=new Emitter(),ps=[],layout=starterShip41(),ledger=newEndless41('RUN',123);
const g={config:{mode:'endless'},run:{mode:'endless',phase:'orbit',moon:'hamsi',seed:123,day:1,credits:120,sy:layout,fleet13:{docked:false,selected:'courier',owned:{courier:layout}},endless41:ledger},opts:{mode:'endless'},profile,ship,physics,scene,engine:{scene},world:{},hostData:{},isHost:true,selfId:'H',net,mods,remotes:new Map(),ui:{},settings:{},creatures:{host:new Map(),views:new Map(),damage(){throw Error('unexpected damage');}},aiPlayers:()=>ps,aiPlayerById:id=>ps.find(p=>p.id===id),refreshStats(){},broadcastRun:hostMethods.broadcastRun,hostSave:hostMethods.hostSave,registerHandlers:hostMethods.registerHandlers,requestLoadout(){throw Error('ordinary loadout leaked');},hostUpdate(){throw Error('ordinary director leaked');},hostThrowables(){},onItemHeld(){},onItemDropped(){},onItemImpact(){},unloadMap(){},hostFinishTakeoff(){if(this.run.phase!=='takeoff')return;this.run.phase='orbit';},env:{setSpace(){}},planetColorFor(){return 0;}};
g.items=new ItemManager(g);net.on_('it',d=>g.items.onEvent(d));const api=g.endless41=installEndless41(g,{presentation:false});g.registerHandlers();
try{
 physics.step(1/30);let p;
 for(let x=-5.8;x<-4.3&&!p;x+=.2)for(let z=1.2;z<2.8&&!p;z+=.2){const q={id:'H',pos:new THREE.Vector3(x,.05,z),eye:new THREE.Vector3(x,1.67,z),dead:false,inShip:true,heldItem:()=>null,slots:[]};ps.splice(0,ps.length,q);g.player=q;if(api.canPrepare('H'))p=q;}
 assert(p,'actual ship terminal has a native standing/range/LOS purchase approach');
 const originalEye=p.eye;p.eye=1.62;assert(api.canPrepare('H'),'scalar native eye fallback retains physical proof');p.pos.x+=4;assert(!api.canPrepare('H'));p.pos.x-=4;p.eye=originalEye;
 const nativeRadio=g.items.hostSpawn('walkie',p.pos.clone(),{holder:'H'});assert(api.grantStarter('H'));assert.equal([...g.items.all()].filter(it=>it.type==='walkie'&&it.holder==='H').length,1,'native hostStart radio is reused instead of duplicating the starter walkie');assert.equal([...g.items.all()].length,4);assert(!api.grantStarter('H'));net.request('loadout',{weapon:'katana',pid:'fake'});assert.equal([...g.items.all()].length,4,'legacy loadout cannot grant arbitrary mode gear');
 assert(api.awardXp('H',36));const o=api.offer();assert(o&&o.choices.length===3);const choice=o.choices[0];net.request('e41req',{op:'choose',id:choice.id,...o});assert.equal(api.build().perks[choice.id],1);net.request('e41req',{op:'choose',id:choice.id,...o});assert.equal(api.build().perks[choice.id],1);
 ledger.shipHp=50;const buy={op:'buy',id:'repair',token:ledger.token,revision:ledger.revision};net.request('e41req',buy);assert.equal(ledger.shipHp,150);assert.equal(g.run.credits,75);net.request('e41req',buy);assert.equal(g.run.credits,75,'stale spending receipt rejected');
 const credit=g.run.credits;net.handlers.get('e41req')({op:'buy',id:'repair',token:ledger.token,revision:ledger.revision},'unknown');assert.equal(g.run.credits,credit);
 const far=p.pos.clone();p.pos.set(70,.05,70);net.request('e41req',{op:'buy',id:'repair',token:ledger.token,revision:ledger.revision});assert.equal(g.run.credits,credit);p.pos.copy(far);
 const blocker=physics.addStaticBox(p.eye.x,p.eye.y,p.eye.z,.08,.08,.08);physics.step(1/30);assert(!api.canPrepare('H'));physics.removeCollider(blocker);physics.step(1/30);
 // Labelled stock fixture; the native sale must remove exactly these native IDs.
 const loot=g.items.hostSpawn('mug',new THREE.Vector3(3,1,0),{value:40});const outside=g.items.hostSpawn('goldbar',new THREE.Vector3(30,1,30),{value:200});
 const saleCredits=75+Math.round(40*(1+.05*(api.build().perks.salvage||0)+effects(g.run.sy).sellBonus));net.request('e41req',{op:'buy',id:'cashout',token:ledger.token,revision:ledger.revision});assert(!g.items.get(loot));assert(g.items.get(outside));assert.equal(g.run.credits,saleCredits);net.request('e41req',{op:'buy',id:'cashout',token:ledger.token,revision:ledger.revision});assert.equal(g.run.credits,saleCredits,'empty/replayed cargo cannot mint credits');
 net.players.set('P',{id:'P',pid:'peer'});mods.emit('update',1/60,g);assert(!ledger.players.P,'no kit before a real known living player snapshot');g.settings.tagAvatars=false;const remote=new RemotePlayer(g,'P',{name:'Peer'});g.remotes.set('P',remote);ps.push({id:'P',pos:remote.pos,eye:p.eye.clone(),dead:remote.dead});mods.emit('update',1/60,g);assert(!ledger.players.P,'actual RemotePlayer at constructor pose cannot reserve or receive kit');remote.applyState({p:p.pos.toArray(),y:0,pt:0,f:0});mods.emit('update',1/60,g);const peerKit=[...g.items.all()].filter(it=>it.holder==='P');assert.equal(peerKit.length,4,'first native peer state admits deferred orbit kit');mods.emit('update',1/60,g);assert.equal([...g.items.all()].filter(it=>it.holder==='P').length,4,'subsequent update does not duplicate a deferred kit');remote.dispose();g.remotes.delete('P');
 g.hostSave();saveProfile(profile);assert.equal(writes.length,0,'Endless never writes a campaign run or disposable profile');assert.deepEqual(original,before);
 g.run.reactor38={ready:false,installed:{id:'spent',value:0,baseValue:0}};const fuelCredit=g.run.credits;net.request('e41req',{op:'buy',id:'refuel',token:ledger.token,revision:ledger.revision});assert(g.run.reactor38.ready);assert.equal(g.run.credits,fuelCredit-45);assert.equal(g.run.reactor38.installed.value,0);const chargedCredit=g.run.credits;net.request('e41req',{op:'buy',id:'refuel',token:ledger.token,revision:ledger.revision});assert.equal(g.run.credits,chargedCredit,'charged reactor cannot be bought twice even with fresh receipt');g.run.phase='moon';g.run.reactor38.ready=false;net.request('e41req',{op:'buy',id:'refuel',token:ledger.token,revision:ledger.revision});assert.equal(g.run.credits,chargedCredit,'fuel service only in orbit');g.run.phase='orbit';
 g.run.phase='takeoff';g.hostFinishTakeoff();const route=g.run.moon,rev=ledger.revision;assert.notEqual(route,'hamsi');g.hostFinishTakeoff();assert.equal(g.run.moon,route,'repeated native finish cannot reroute an orbiting ship');assert.equal(ledger.revision,rev);
 const nativeBuff={maxHp:125,speedMul:1.1,meleeMul:1.2,rangedMul:1.3,armor:.05};const upgraded=api.stats(nativeBuff);assert(upgraded.maxHp>=nativeBuff.maxHp);assert(upgraded.speedMul>=nativeBuff.speedMul);assert(upgraded.meleeMul>=nativeBuff.meleeMul);assert.deepEqual(nativeBuff,{maxHp:125,speedMul:1.1,meleeMul:1.2,rangedMul:1.3,armor:.05},'mode cannot erase or mutate native room/buff effects');
 assert.equal(errLog.total,0,'native update callbacks cannot hide fixture/game errors');assert.equal(api.status().canShop,true);assert.equal(api.status().grace,90);ledger.elapsed=96;assert.equal(api.status().grace,0);
 ledger.stage='over';assert(!api.canPrepare('H'));assert(!api.awardXp('H',50));
 g.config.mode='normal';g.run.mode='normal';assert(!api.active());
 console.log('PASS endless41 actual ship/Session kit, offers, known living floor/range/LOS station, native one-wallet cargo sale and permanent save isolation');
}finally{api.dispose();api.dispose();g.items.clearAll();g.items.dispose();ship.group.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});physics.dispose();net.transport.leave();net.clear();}

// Native takeoff integration: actual hostFinishTakeoff/hostSetPhase/hurt and
// ItemManager/Session callbacks. Starting field/ship stock are labelled setup;
// the phase receiver models native orbit revival while keeping summary output.
function takeoffFixture({stranded=false,callback=true}={}){
 const physics=new Physics(),scene=new THREE.Scene(),ship=buildShip({scene,physics,lightPool:{add:e=>e,remove(){}}}),net=new Session({strategy:'local',isHost:true,code:'E41-DEPART'});
 net.selfId=net.hostId='H';net.players.set('H',{id:'H'});net.players.set('P',{id:'P'});
 const mods=new Emitter(),ledger=newEndless41('DEPART',456),ps=[{id:'H',pos:new THREE.Vector3(40,0,0),dead:false,inShip:false},{id:'P',pos:new THREE.Vector3(45,0,0),dead:false,inShip:false}];ledger.stage='field';admitPlayer41(ledger,'H','H');admitPlayer41(ledger,'P','P');
 const summaries=[],phases=[],hurts=[];
 const game={config:{mode:'endless'},opts:{mode:'endless'},run:{mode:'endless',phase:'takeoff',moon:'hamsi',seed:456,day:1,credits:100,quotaIndex:0,quota:130,sold:0,daysLeft:999,endless41:ledger},hostData:{collected:new Set(),dayStats:{collected:0,kills:0,deaths:[],per:{}}},profile:sessionProfile41(defaultProfile(),{host:true,mode:'endless'}),physics,scene,engine:{scene},ship,world:{},net,mods,isHost:true,selfId:'H',player:ps[0],aiPlayers:()=>ps,aiPlayerById:id=>ps.find(p=>p.id===id),playerName:id=>id,refreshStats(){},markRunSent(){},hostAnnounce(){},env:{setSpace(){}},planetColorFor:()=>0,hostFinishTakeoff:hostMethods.hostFinishTakeoff,hostSetPhase:hostMethods.hostSetPhase,hostHurtPlayer:hostMethods.hostHurtPlayer,hostSave:hostMethods.hostSave,broadcastRun:hostMethods.broadcastRun,dayPer:hostMethods.dayPer,onItemHeld(){},onItemDropped(){},onItemImpact(){},ui:{}};
 if(stranded)game.hmStrand=left=>new Set(left.map(p=>p.id));
 game.items=new ItemManager(game);net.on_('it',d=>game.items.onEvent(d));net.on_('hurt',d=>{hurts.push(d);game.player.dead=true;});
 const summary=d=>summaries.push({d,stage:ledger.stage});if(callback)net.on_('summary',summary);else net.on('msg:summary',summary);
 net.on_('phase',d=>{phases.push({d,stage:ledger.stage});game.player.dead=false;mods.emit('phase',d.phase,game);});
 const api=game.endless41=installEndless41(game,{presentation:false});physics.step(1/30);
 const cargo=game.items.hostSpawn('mug',new THREE.Vector3(3,1,0),{value:40}),held=game.items.hostSpawn('goldbar',ps[0].pos.clone(),{holder:'H',value:100}),kit=game.items.hostSpawn('pipe',ps[0].pos.clone(),{holder:'H',soulbound:'native-kit'});
 return{game,api,ledger,net,ps,summaries,phases,hurts,cargo,held,kit,dispose(){api.dispose();game.items.clearAll();game.items.dispose();physics.dispose();net.transport.leave();net.clear();}};
}
for(const callback of [true,false]){
 const f=takeoffFixture({callback});try{
  const receiver=f.net.msgHandlers.get('summary'),listeners=f.net._h.get('msg:summary')?.size||0;
  f.game.hostFinishTakeoff();assert.equal(f.summaries.length,1);assert.equal(f.summaries[0].d.allDead,true,'native summary decides complete extraction loss');assert.equal(f.summaries[0].stage,'over','loss is committed before native summary presentation');assert.equal(f.phases[0].stage,'over','native orbit revival cannot overwrite committed loss');assert.equal(f.ledger.stage,'over');assert.equal(f.game.run.moon,'hamsi','a wiped extraction cannot reroute for another landing');assert.equal(f.hurts[0].cause,'left');assert(!f.game.items.get(f.cargo)&&!f.game.items.get(f.held)&&!f.game.items.get(f.kit),'native allDead custody cleanup remains authoritative');
  assert.equal(f.net.msgHandlers.get('summary'),receiver);assert.equal(f.net._h.get('msg:summary')?.size||0,listeners,'scoped native summary listener is removed once');
  const revision=f.ledger.revision;f.game.hostFinishTakeoff();assert.equal(f.summaries.length,1);assert.equal(f.ledger.revision,revision,'repeated finish callback cannot finalize loss twice');f.net.broadcast('summary',{allDead:true});assert.equal(f.ledger.revision,revision,'later native summary cannot trigger a leaked observer');assert(!f.api.awardXp('H',100));
 }finally{f.dispose();}
}
{
 const f=takeoffFixture({stranded:true});try{
  const receiver=f.net.msgHandlers.get('summary');f.game.hostFinishTakeoff();assert.equal(f.summaries[0].d.allDead,false,'native stranded hook determines a surviving extraction');assert.equal(f.ledger.stage,'preparation');assert.notEqual(f.game.run.moon,'hamsi');assert.equal(f.hurts.length,0);assert(f.game.items.get(f.cargo)&&f.game.items.get(f.kit),'native stranded stock and personal kit survive');assert(!f.game.items.get(f.held),'native stranded exterior scrap is still lost');assert.equal(f.net.msgHandlers.get('summary'),receiver);
 }finally{f.dispose();}
}
assert.equal(errLog.total,0,'native takeoff Session callbacks cannot hide errors');
console.log('PASS endless41 actual native allDead/stranded takeoff summaries, pre-orbit loss, custody, reroute and scoped observer replay cleanup');
