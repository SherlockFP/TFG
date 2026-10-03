// Native integration: actual fitted ship stairs/door, Rapier bodies, items and Session.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {buildShip,insideShip} from '../../src/world/ship.js';
import {ItemManager} from '../../src/entities/items.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {hostMethods} from '../../src/game/host.js';
import {Session} from '../../src/net/session.js';
import {Emitter,errLog} from '../../src/core/events.js';
import {newEndless41} from '../../src/game/endless41_core.js';
const feature=await import('../../src/game/endless41_robots.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
assert.equal(typeof feature.installEndless41Robots,'function','Endless needs physically owned purchasable robots');
await initPhysics();window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};const initialErrors=errLog.total;
function fixture(){
 const physics=new Physics(),scene=new THREE.Scene(),ship=buildShip({physics,lightPool:{add:e=>e,remove(){}},scene});scene.add(ship.group);ship.door.setOpen(true,true);const terrain=physics.addStaticBox(0,-1.15,0,50,.15,50);
 const nativeBase=physics.info.size;const net=new Session({strategy:'local',isHost:true,code:'robots41'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
 const run={mode:'endless',phase:'moon',moon:'hamsi',seed:41,day:1,credits:300,endless41:newEndless41('robots41',41)},players=[{id:'H',pos:new THREE.Vector3(-5.1,.03,2.55),eye:new THREE.Vector3(-5.1,1.65,2.55),dead:false,zone:'out',inShip:true}],wire=[];
 const game={isHost:true,selfId:'H',config:{mode:'endless'},run,physics,scene,engine:{scene},ship,mods:new Emitter(),world:{moonId:'hamsi',seed:41,terrain:{heightAt:()=>-1}},net,remotes:new Map(),aiPlayerById:id=>players.find(p=>p.id===id),aiPlayers:()=>players,broadcastRun(keys){net.broadcast('gs',Object.fromEntries(keys.map(k=>[k,structuredClone(run[k])])));},endless41:{active:()=>true,canPrepare:()=>true,stationPoint:()=>ship.points.terminal,build:()=>({perks:{}}),ownsCreature:c=>c.data?.e41===true},onItemHeld(){},onItemDropped(){},onItemImpact(){}};
 game.items=new ItemManager(game);net.on_('it',d=>{wire.push(structuredClone(d));game.items.onEvent(d);});net.on_('gs',()=>{});for(let i=0;i<3;i++)physics.step(1/60);const api=feature.installEndless41Robots(game);
 const tick=(dt=1/60)=>{api.tick(dt);physics.step(dt);game.items.update(dt);game.time=(game.time||0)+dt;net.flush();};
 return{game,api,physics,ship,players,wire,tick,dispose(){api.dispose();game.items.clearAll();game.items.dispose();assert.equal(physics.info.size,nativeBase,'robot cleanup preserves only original ship/terrain colliders');for(const handle of [...physics.info.keys()])physics.removeCollider(physics.world.getCollider(handle));assert.equal(physics.info.size,0);physics.dispose();net.transport.leave();net.clear();}};
}
{
 const f=fixture();try{assert(f.api.buy('hauler','H'));assert.equal(f.game.run.credits,220);assert.equal(f.game.run.endless41.robots.length,1);assert(!f.api.buy('hauler','H'));assert(f.api.buy('hauler_upgrade','H'));assert.equal(f.game.run.endless41.robots[0].rank,2);assert.equal(f.game.run.credits,160);f.players[0].dead=true;assert(!f.api.buy('guardian','H'));f.players[0].dead=false;assert(!f.api.buy('guardian','unknown'));console.log('PASS robots41 atomic native purchase/rank/known-living authority');}finally{f.dispose();}
}
{
 const f=fixture();try{assert(f.api.buy('hauler','H'));const id=f.game.items.hostSpawn('bolt',new THREE.Vector3(2.6,-.55,10),{value:42,baseValue:42}),item=f.game.items.get(id);f.players[0].pos.set(2.6,-1,8);f.players[0].eye.set(2.6,.62,8);f.players[0].inShip=false;let held=false,delivered=false;
  for(let i=0;i<5400;i++){f.tick();if(item.holder?.startsWith('c:e41robot:'))held=true;if(held&&item.state==='world'&&insideShip(item.obj.position)){delivered=true;break;}}
  assert(held,'actual robot reaches exterior cargo and claims native same-ID custody');assert(delivered,'actual robot climbs native ship stairs and open doorway to unload aboard');assert.equal(item.value,42);assert.equal([...f.game.items.all()].length,1);assert.equal(f.wire.filter(d=>d.e==='held'&&d.id===id).length,1);assert.equal(f.wire.filter(d=>d.e==='drop'&&d.id===id).length,1);console.log('PASS robots41 actual native exterior pickup/stairs/airlock same-ID cargo delivery');
 }finally{f.dispose();}
}
assert.equal(errLog.total,initialErrors);




{
 const f=fixture();try{
  const baseline=f.game.run.credits;f.game.run.credits=NaN;assert(!f.api.buy('hauler','H'));f.game.run.credits=79;assert(!f.api.buy('hauler','H'));assert.equal(f.game.run.endless41.robots.length,0);f.game.run.credits=baseline;
  const p=f.players[0],position=p.pos.clone(),eye=p.eye.clone();p.pos.x+=20;p.eye.x+=20;assert(!f.api.buy('hauler','H'));p.pos.copy(position);p.eye.copy(eye);
  const blocker=f.physics.addStaticBox(-5.6,1.0,2.55,.12,.7,.4);f.physics.step(1/60);assert(!f.api.buy('hauler','H'),'actual station LOS is required');f.physics.removeCollider(blocker);
  f.game.run.endless41.stage='over';assert(!f.api.buy('hauler','H'));f.game.run.endless41.stage='preparation';
  let reentries=0;f.game.net.on_('gs',()=>{if(reentries++===0)assert(!f.api.buy('hauler','H'),'reserved ownership prevents synchronous duplicate purchase');});assert(f.api.buy('hauler','H'));assert.equal(f.game.run.credits,baseline-80);assert.equal(f.game.run.endless41.nextRobot,2);
  f.game.run.credits=NaN;assert(!f.api.buy('hauler_upgrade','H'));f.game.run.credits=500;assert(f.api.buy('hauler_upgrade','H'));assert(f.api.buy('hauler_upgrade','H'));const current=f.game.run.credits;assert(!f.api.buy('hauler_upgrade','H'));assert.equal(f.game.run.credits,current);assert.equal(f.api.catalog().find(c=>c.id==='hauler_upgrade').level,3);
  console.log('PASS robots41 finite wallet, station LOS/range, rank cap and synchronous purchase re-entry');
 }finally{f.dispose();}
}
{
 const f=fixture();try{
  assert(f.api.buy('guardian','H'));f.game.creatures=new CreatureManager(f.game);f.game.net.on_('cev',d=>f.game.creatures.onEvent(d));
  const enemy=f.game.creatures.hostSpawn('scuttler',new THREE.Vector3(2.6,-1,6),{affix:null,variant:null});assert(enemy);enemy.hp=enemy.maxHp=300;enemy.data.e41=true;
  const other=f.game.creatures.hostSpawn('scuttler',new THREE.Vector3(1.5,-1,6),{affix:null,variant:null});other.hp=other.maxHp=300;
  f.tick();assert.equal(enemy.hp,286,'guardian damages the native owned actor');assert.equal(other.hp,300,'normal actors are excluded');for(let i=0;i<30;i++)f.tick();assert.equal(enemy.hp,286,'native attack cooldown bounds damage');
  const block=f.physics.addStaticBox(2.6,.1,4.8,1.3,1.1,.1);for(let i=0;i<120;i++)f.tick();assert.equal(enemy.hp,286,'static line of sight blocks guard attacks');f.physics.removeCollider(block);
  enemy.pos.set(2.6,-1,30);for(let i=0;i<120;i++)f.tick();assert.equal(enemy.hp,286,'eight-metre range excludes distant native actor');
  enemy.pos.set(2.6,-1,6);f.game.endless41.build=()=>({perks:{guardian:2}});f.tick();assert.equal(enemy.hp,267.8,'temporary guardian firmware scales native damage');
  f.game.creatures.clearAll();f.game.creatures.dispose?.();f.game.creatures=null;console.log('PASS robots41 native CreatureManager owned damage, LOS, cooldown, range and temporary firmware');
 }finally{if(f.game.creatures){f.game.creatures.clearAll();f.game.creatures.dispose?.();f.game.creatures=null;}f.dispose();}
}
{
 const f=fixture();try{
  assert(f.api.buy('hauler','H'));const id=f.game.items.hostSpawn('bolt',new THREE.Vector3(2.6,-.55,10),{value:42}),item=f.game.items.get(id);f.players[0].pos.set(2.6,-1,8);f.players[0].eye.set(2.6,.62,8);f.players[0].inShip=false;
  hostMethods.registerHandlers.call(f.game);let held=false;for(let i=0;i<2400;i++){f.tick();if(item.holder?.startsWith('c:e41robot:')){held=true;break;}}assert(held);const robot=f.game.run.endless41.robots[0],lastPos=[...robot.pos];f.game.player={pos:f.players[0].pos};f.game.net.request('pick',{id,slot:0});assert.equal(item.holder,`c:e41robot:${robot.id}`,'native manual pickup cannot steal robot custody');
  f.game.run.phase='takeoff';f.game.mods.emit('phase','takeoff',f.game);assert.equal(item.state,'world');assert.equal(robot.hp,0,'actual departure strands an outside robot');assert(Math.hypot(item.obj.position.x-lastPos[0],item.obj.position.z-lastPos[2])<.06,'departure drops cargo at its real robot location');f.game.mods.emit('phase','takeoff',f.game);assert.equal(f.wire.filter(d=>d.e==='drop'&&d.id===id).length,1,'repeat phase never duplicates release');
  console.log('PASS robots41 native manual pickup conflict and actual outside departure custody release');
 }finally{f.dispose();}
}
{
 const f=fixture();try{
  assert(f.api.buy('hauler','H'));const id=f.game.items.hostSpawn('bolt',new THREE.Vector3(2.6,-.55,10),{value:42}),before=f.game.items.get(id).obj.position.clone();f.players[0].pos.set(2.6,-1,8);f.players[0].eye.set(2.6,.62,8);const block=f.physics.addStaticBox(2.6,.8,3.65,1.15,.8,.16);f.physics.step(1/60);
  for(let i=0;i<600;i++)f.tick();const item=f.game.items.get(id);assert.equal(item.state,'world');assert.equal(item.holder,null);assert(Math.hypot(item.obj.position.x-before.x,item.obj.position.z-before.z)<.08,'blocked door leaves exterior cargo under native physics');assert(insideShip(new THREE.Vector3(...f.game.run.endless41.robots[0].pos)),'blocked robot stays physically aboard');f.physics.removeCollider(block);console.log('PASS robots41 blocked real doorway waits without bypassing custody or geometry');
 }finally{f.dispose();}
}
assert.equal(errLog.total,initialErrors,'native modules leave no swallowed event errors');


{
 const host=fixture(),peer=fixture();let replacement;try{
  assert(host.api.buy('hauler','H'));const id=host.game.items.hostSpawn('bolt',new THREE.Vector3(2.6,-.55,10),{value:42,baseValue:42});host.players[0].pos.set(2.6,-1,8);host.players[0].eye.set(2.6,.62,8);
  peer.game.isHost=peer.game.net.isHost=false;peer.game.selfId=peer.game.net.selfId='P';peer.game.net.hostId='H';peer.game.net.players.set('P',{id:'P'});host.game.net.players.set('P',{id:'P'});host.game.net.transport.peers.add('P');host.game.net.transport.send=(message,to)=>{if(to==='P'||!to)peer.game.net.receive(message,'H');};
  peer.game.net.on_('welcome',d=>{peer.game.run=structuredClone(d.run);peer.game.items.clearAll();for(const row of d.items)peer.game.items.onEvent({e:'sp',...row});});peer.game.net.on_('gs',d=>Object.assign(peer.game.run,structuredClone(d)));
  host.game.net.sendTo('P','welcome',{run:structuredClone(host.game.run),items:host.game.items.serialize(()=>true)});host.game.net.flush();assert.equal(peer.game.run.endless41.robots.length,1);assert.equal(peer.game.items.get(id).value,42);
  let carried=false;for(let i=0;i<2400;i++){host.tick();peer.tick();if(host.game.items.get(id).holder?.startsWith('c:e41robot:')){host.game.net.flush();peer.tick();carried=true;break;}}assert(carried);
  const robot=peer.game.run.endless41.robots[0],item=peer.game.items.get(id);assert.equal(item.holder,`c:e41robot:${robot.id}`);assert.equal(item.obj.parent.parent.userData.e41robot,robot.id,'peer attaches its actual native item to replicated carry anchor');assert.equal([...peer.game.items.all()].length,1);assert(JSON.stringify(robot).length<1000,'ledger remains bounded plain JSON');
  peer.api.dispose();peer.game.isHost=peer.game.net.isHost=true;peer.game.net.hostId='P';peer.game.net.players.delete('H');replacement=feature.installEndless41Robots(peer.game);const credits=peer.game.run.credits;replacement.tick(1/60);peer.physics.step(1/60);assert.equal(peer.game.run.endless41.robots.length,1);assert.equal(peer.game.run.endless41.robots[0].rank,1);assert.equal(peer.game.items.get(id).holder,`c:e41robot:${robot.id}`);assert.equal(peer.game.run.credits,credits);assert.equal([...peer.game.items.all()].length,1,'promotion rebuilds one native cargo identity');
  replacement.dispose();replacement=null;console.log('PASS robots41 real Session welcome/gs/held replication and native host-promotion custody');
 }finally{replacement?.dispose();host.dispose();peer.dispose();}
}
{
 const f=fixture();try{f.game.run.mode='normal';const credits=f.game.run.credits,colliders=f.physics.info.size;assert(!f.api.buy('hauler','H'));f.tick();assert.equal(f.physics.info.size,colliders);assert.equal(f.game.run.credits,credits);assert.equal(f.game.run.endless41.robots.length,0);f.api.dispose();f.api.dispose();console.log('PASS robots41 ordinary campaign exclusion and repeat disposal');}finally{f.dispose();}
}
assert.equal(errLog.total,initialErrors);
