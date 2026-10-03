import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {ItemManager} from '../../src/entities/items.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {installCrew38} from '../../src/game/crew38.js';
import {hostMethods} from '../../src/game/host.js';
import {GAME_VERSION} from '../../src/net/lobby.js';
import {insideShip} from '../../src/world/ship.js';
await initPhysics();
const physics=new Physics(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(72),mods=new Emitter();
const net=new Session({strategy:'local',isHost:true,code:'crew38'});net.selfId=net.hostId='H';
const game={physics,engine:{scene,camera,fx:{}},mods,net,settings:{fov:72,headBob:false,reduceMotion:false},run:{runId:'crew38'},selfId:'H',isHost:true,remotes:new Map(),ui:{toast(){}},onItemHeld(it){this.player.slots[0]=it.id;},onItemDropped(){},broadcastRun(){}};
game.player=new LocalPlayer(game);game.items=new ItemManager(game);net.on_('it',d=>game.items.onEvent(d));
const api=installCrew38(game);
try{
 mods.emit('hostStart',game);mods.emit('hostStart',game);
 assert.equal([...game.items.all()].filter(it=>it.type==='walkie').length,1,'native starter radio once');
 const retired=game.items.hostSpawn('taser',new THREE.Vector3(2,1,0));api.issue();assert(!game.items.get(retired),'old Zap Gun is removed from live custody');
 // Actual Session hello -> admitted native host join -> module event. A remote
 // has no authoritative hand slots yet, so its new radio belongs on ship floor.
 game.world={facility:null};game.ship={door:{open:true}};game.config={};
 game.helloData=()=>({name:'Host'});game.creatures={serializeFor:()=>[]};game.hostAnnounce=()=>{};
 game.ensureRemote=(id,info)=>{
  let remote=game.remotes.get(id);
  if(!remote){remote={id,pos:new THREE.Vector3(0,.05,0),dead:false,setInfo(d){this.name=d.name;}};game.remotes.set(id,remote);}
  return remote;
 };
 net.on('playerJoin',(id,info,resume)=>hostMethods.hostOnPlayerJoin.call(game,id,info,resume));
 const before=[...game.items.all()].filter(it=>it.type==='walkie').length;
 net.receive({t:'hello',d:{ver:GAME_VERSION,name:'Joining Crew'}},'P');
 const radios=[...game.items.all()].filter(it=>it.type==='walkie');
 assert.equal(radios.length,before+1,'admitted late join immediately receives native radio');
 const issued=radios.find(it=>!it.holder);
 assert(issued&&insideShip(issued.obj.position),'remote without known slots receives world cargo on ship');
 assert(game.run.radio38.includes('P'));
 net.receive({t:'hello',d:{ver:GAME_VERSION,name:'Joining Crew'}},'P');
 assert.equal([...game.items.all()].filter(it=>it.type==='walkie').length,before+1,'Session reconnect does not duplicate radio');
 mods.gateJoin=()=>false;
 net.receive({t:'hello',d:{ver:GAME_VERSION,name:'Rejected Crew'}},'Q');
 assert(!game.run.radio38.includes('Q'),'rejected join consumes no radio receipt');
 assert.equal([...game.items.all()].filter(it=>it.type==='walkie').length,before+1);
 const p=game.player;p.grounded=true;p._prevY=0;p.pos.y=.3;
 p.updateCamera(.05,0,true);
 assert(camera.position.y<1.8,'30cm autostep at20fps must ease eye rather than instantly snap1.92m');
 for(let i=0;i<20;i++)p.updateCamera(.05,0,true);
 assert(Math.abs(camera.position.y-1.92)<.015,'camera settles at native feet plus standing eye');
 const savedDocument=globalThis.document;let writes=0;
 globalThis.document={body:{appendChild(){}},createElement(){return{style:new Proxy({},{set(o,k,v){writes++;o[k]=v;return true;}}),set textContent(v){writes++;this.text=v;},remove(){}};}};
 try{
  game.run.departure38={seconds:8};mods.emit('update',.016,game);const steady=writes;
  for(let i=0;i<60;i++)mods.emit('update',.016,game);
  assert.equal(writes,steady,'same countdown second performs no repeated DOM writes');
  game.run.departure38=null;mods.emit('update',.016,game);const hidden=writes;
  for(let i=0;i<60;i++)mods.emit('update',.016,game);
  assert.equal(writes,hidden,'hidden countdown performs no repeated DOM writes');
 }finally{globalThis.document=savedDocument;}
 console.log('PASS native once-only and admitted late-join radio, reconnect/rejection custody, countdown DOM stability and low-FPS stair camera easing');
}finally{api.dispose();game.items.dispose();physics.dispose();net.transport.leave();net.clear();}
