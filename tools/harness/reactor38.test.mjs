import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {buildShip} from '../../src/world/ship.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {ItemManager} from '../../src/entities/items.js';
import {installReactor38} from '../../src/game/reactor38.js';
await initPhysics();
const physics=new Physics(),scene=new THREE.Scene(),mods=new Emitter();
const ship=buildShip({physics,scene,lightPool:{add:x=>x}});
const net=new Session({strategy:'local',isHost:true,code:'core38'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
let calls=0;
const player={pos:new THREE.Vector3(5.3,.05,-2.3),dead:false,downed:false,eyePos(){return this.pos.clone().add(new THREE.Vector3(0,1.62,0));}};
const game={physics,engine:{scene},scene,ship,mods,net,selfId:'H',isHost:true,player,remotes:new Map(),run:{runId:'test',phase:'orbit',moon:'hamsi'},onItemHeld(){},onItemDropped(){},hostSave(){},broadcastRun(){},hostLever(){calls++;this.run.phase='landing';mods.emit('phase','landing',this);}};
game.items=new ItemManager(game);net.on_('it',d=>game.items.onEvent(d));
const api=installReactor38(game);mods.emit('hostStart',game);mods.emit('registerHandlers',(k,fn)=>net.handle(k,fn),game);physics.step(1/30);
try{
 game.hostLever('H');assert.equal(calls,1);assert.equal(api.state().ready,false,'native landing spends bootstrap flight');
 game.run.phase='orbit';game.hostLever('H');assert.equal(calls,1,'spent core prevents another planetary landing');
 game.run.moon='hq';game.hostLever('H');assert.equal(calls,2,'HQ recovery is never stranded by empty fuel');game.run.phase='orbit';game.run.moon='hamsi';
 net.request('reactor38',{...api.receipt(),op:'remove'});assert.equal(api.state().installed,null);assert.equal([...game.items.all()].length,1);
 const spent=[...game.items.all()][0];assert.equal(spent.type,'reactor');assert.equal(spent.value,0);
 const id=game.items.hostSpawn('reactor',player.pos.clone(),{holder:'H',value:200});
 physics.step(1/30);
 let replayed=false;net.on_('it',d=>{game.items.onEvent(d);if(d.e==='rm'&&!replayed){replayed=true;net.request('reactor38',{...api.receipt(),op:'install',id});}});
 net.request('reactor38',{...api.receipt(),op:'install',id});assert.equal(api.state().ready,true);assert.equal(api.state().exchanged,1);assert(!game.items.get(id));
 const restored=JSON.parse(JSON.stringify(game.run));game.run=restored;assert.equal(api.state().installed.id,id,'save state retains native core identity');
 net.request('reactor38',{...api.receipt(),op:'remove'});const ejected=game.items.get(id);assert(ejected);assert.equal(ejected.value,0);assert.equal(api.state().ready,false);
 game.items.onEvent({e:'held',id,h:'H'});net.request('reactor38',{...api.receipt(),op:'install',id});assert.equal(api.state().installed,null,'spent physical core cannot recharge');
 const fresh=game.items.hostSpawn('reactor',player.pos.clone(),{holder:'H',value:220});
 for(const bad of ['dead','downed','far','wall','peer']){
  player.dead=bad==='dead';player.downed=bad==='downed';player.pos.set(bad==='far'?0:5.3,.05,-2.3);
  const wall=bad==='wall'?physics.addStaticBox(5.5,1.5,-2.4,.03,1,.7):null;physics.step(1/30);
  api.exchange({...api.receipt(),op:'install',id:fresh},bad==='peer'?'unknown':'H');assert.equal(api.state().installed,null,bad+' blocked');
  if(wall)physics.world.removeCollider(wall,true);
 }
 console.log('PASS actual ship/Rapier/Session core exchange, native item custody, spent rejection, reentrancy, save and HQ recovery');
}finally{api.dispose();game.items.dispose();net.transport.leave();net.clear();physics.dispose();}
