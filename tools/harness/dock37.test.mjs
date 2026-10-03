// Native integration: real ship geometry, Rapier queries, Session self delivery.
// Starting at the certified cockpit access spot is labelled fixture setup.
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {buildShip} from '../../src/world/ship.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {installFleet13} from '../../src/game/fleet13.js';
import {sanitizeFleet13,fleetLayout} from '../../src/game/fleet13_core.js';
import {hostMethods} from '../../src/game/host.js';
import {leverReceipt39} from '../../src/game/extraction39.js';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {actionMethods}=await import('../../src/game/actions.js');
await initPhysics();
const physics=new Physics(),scene=new THREE.Scene();
const ship=buildShip({physics,scene,lightPool:{add:x=>x}});
physics.step(1/30);
const net=new Session({strategy:'local',isHost:true,code:'dock37'});
net.selfId=net.hostId='H';
const mods=new Emitter(),toasts=[],received=[];
const player={pos:new THREE.Vector3(-5.25,.05,.9),dead:false,downed:false,inShip:true,eyePos(){return this.pos.clone().add(new THREE.Vector3(0,1.62,0));},teleport(p){this.pos.copy(p);}};
const fleet=sanitizeFleet13({docked:true,selected:'courier',owned:{courier:fleetLayout('courier')}});
const phases=[];
const game={net,mods,physics,scene,ship,player,selfId:'H',isHost:true,remotes:new Map(),world:{moonId:'__relay13'},run:{phase:'orbit',moon:'hamsi',day:1,daysLeft:3,fleet13:fleet,sy:fleetLayout('courier')},profile:{shipyard:{}},ui:{toast:s=>toasts.push(s)},hostLever:hostMethods.hostLever,hostData:{},items:{inShipItems:()=>[],get:()=>null},freshDayStats:()=>({}),hostSetPhase(ph){this.run.phase=ph;phases.push(ph);},later(){},loadMapFor(){this.world.moonId=null;},hostSave(){},broadcastRun(){}};
net.on_('tp',d=>{received.push(d);player.teleport(new THREE.Vector3().fromArray(d.p));});
const api=installFleet13(game);
hostMethods.registerHandlers.call(game);
try {
 const dispatchReceipt=leverReceipt39(game);
 const lever={pos:ship.points.lever,r:.6,label:'Land on hamsi [E]',action:()=>net.request('lever',dispatchReceipt)};
 const camera=new THREE.PerspectiveCamera();camera.position.copy(player.eyePos());camera.lookAt(ship.points.lever);camera.updateMatrixWorld();game.camera=camera;
 game.interactablesNow=()=>{const list=[lever];mods.emit('interactables',list,game);return list;};
 const interaction=actionMethods.findInteraction.call(game);
 assert(interaction,'native ray/LOS exposes cockpit control at certified access spot');
 assert.match(interaction.label,/Board/,'dock prompt describes dispatch rather than landing');
 interaction.action();
 assert.equal(api.docked(),false,'usable dock cockpit lever must dispatch instead of saying visit the dock');
 assert.equal(received.length,1,'native Session delivers dispatch teleport to host');
 assert.deepEqual(phases,[],'dispatch and planetary landing remain distinct');
 // Dispatch owns a teleport to its ship spawn. Restore the certified cockpit
 // access as labelled setup, just as an independently walked browser operator
 // must regain range; this fixture does not claim an earned walk.
 player.teleport(new THREE.Vector3(-5.25,.05,.9));physics.step(1/30);
 interaction.action();assert.deepEqual(phases,[],'cached dock dispatch cannot become a planetary landing after dispatch');
 net.request('lever',leverReceipt39(game));assert.deepEqual(phases,['landing'],'fresh cockpit lever reaches actual host landing');
 for(const invalid of ['far','dead','downed','peer','stale','wall','unselected']){
  game.run.phase='orbit';game.run.fleet13.docked=true;game.run.fleet13.selected=invalid==='unselected'?null:'courier';
  game.world.moonId=invalid==='stale'?'hamsi':'__relay13';player.pos.set(invalid==='far'?0:-5.25,.05,.9);
  player.dead=invalid==='dead';player.downed=invalid==='downed';
  const wall=invalid==='wall'?physics.addStaticBox(-5.5,1,.9,.04,1,.4):null;
  physics.step(1/30);
  game.hostLever(invalid==='peer'?'P':'H');
  assert.equal(api.docked(),true,invalid+' cannot dispatch');
  if(wall)physics.world.removeCollider(wall,true);
 }
 assert(!toasts.some(s=>s.includes('Visit the dock before launching')));
 console.log('PASS dock cockpit dispatch, native self teleport, normal landing handoff and admission guards');
} finally {api.dispose();net.transport.leave();net.clear();physics.world.free();}
