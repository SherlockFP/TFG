// NATIVE_INTEGRATION: real ship/Rapier, action selector and two real Sessions.
// Cockpit poses and the controlled game.later clock are explicit setup fixtures.
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {register} from 'node:module';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {buildShip,insideShip,inDoorway} from '../../src/world/ship.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {hostMethods} from '../../src/game/host.js';
import {installCrew38} from '../../src/game/crew38.js';
import {departureCrew39,leverReceipt39} from '../../src/game/extraction39.js';
import {installHostMig} from '../../src/game/hostmig.js';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {actionMethods}=await import('../../src/game/actions.js');
await initPhysics();
const physics=new Physics(),scene=new THREE.Scene(),ship=buildShip({physics,scene,lightPool:{add:x=>x}});
physics.step(1/30);
const hostNet=new Session({strategy:'local',isHost:true,code:'extraction39'}),peerNet=new Session({strategy:'local',isHost:false,code:'extraction39'});
hostNet.selfId=hostNet.hostId='H';peerNet.selfId='P';peerNet.hostId='H';peerNet.connected=true;
for(const net of [hostNet,peerNet])for(const id of ['H','P'])net.players.set(id,{id});
hostNet.transport.peers.add('P');peerNet.transport.peers.add('H');
hostNet.transport.send=(m)=>peerNet.receive(JSON.parse(JSON.stringify(m)),'H');
peerNet.transport.send=(m)=>hostNet.receive(JSON.parse(JSON.stringify(m)),'P');
const player={pos:new THREE.Vector3(-5.25,.05,.9),dead:false,downed:false,heldItem:()=>null,eyePos(){return this.pos.clone().add(new THREE.Vector3(0,1.62,0));},get inShip(){return insideShip(this.pos);}};
const remote={id:'P',pos:new THREE.Vector3(-5.25,.05,.9),dead:false,downed:false,crouch:false};
const run={runId:'extraction39',phase:'moon',moon:'hamsi',seed:39,day:1},peerRun=structuredClone(run),mods=new Emitter(),timers=[];
let now=0,seq=0,flights=0;
const game={net:hostNet,mods,physics,scene,ship,player,run,selfId:'H',get isHost(){return this.net.isHost;},remotes:new Map([['P',remote]]),world:{facility:null},hostData:{},items:{get:()=>null},sfx(){},animLever(){},hostAnnounce(){},markRunSent(){},hostSave(){},
 hostLever:hostMethods.hostLever,hostBeginTakeoff:hostMethods.hostBeginTakeoff,hostSetPhase:hostMethods.hostSetPhase,broadcastRun:hostMethods.broadcastRun,
 hostFinishTakeoff(){flights++;},later(fn,ms){timers.push({at:now+ms,seq:seq++,fn});},
 aiPlayers(){return[{id:'H',pos:player.pos,dead:player.dead,inShip:insideShip(player.pos)},{id:'P',pos:remote.pos,dead:remote.dead,inShip:insideShip(remote.pos)}];},
 interactablesNow:actionMethods.interactablesNow,
};
hostNet.on_('gs',d=>Object.assign(run,d));peerNet.on_('gs',d=>Object.assign(peerRun,d));
hostNet.on_('phase',d=>Object.assign(run,d));peerNet.on_('phase',d=>Object.assign(peerRun,d));
const doors=[];hostNet.on_('door',d=>doors.push(d));
hostMethods.registerHandlers.call(game);
const token='["extraction39","hamsi",39,1,"moon",0,0]';
const pull=(revision)=>{peerNet.request('lever',{token,revision});peerNet.flush();hostNet.flush();};
function advance(ms){const end=now+ms;while(true){timers.sort((a,b)=>a.at-b.at||a.seq-b.seq);if(!timers.length||timers[0].at>end)break;const t=timers.shift();now=t.at;t.fn();}now=end;hostNet.flush();}
function selection(){const camera=new THREE.PerspectiveCamera();camera.position.copy(player.eyePos());camera.lookAt(ship.points.lever);camera.updateMatrixWorld();game.camera=camera;return actionMethods.findInteraction.call(game);}
try{
 const start=selection();assert.match(start?.label,/take off/i,'real native selector presents ship departure');start.action();hostNet.flush();
 assert.equal(run.departure38?.seconds,8);assert.equal(peerRun.departure38?.seconds,8,'native host broadcast reaches peer');
 advance(2000);assert.equal(run.departure38.seconds,6);
 pull(1);
 assert.equal(run.departure38,null,'second current native peer lever request cancels countdown');
 assert.equal(peerRun.departure38,null,'cancel reaches peer through actual Session receive');
 advance(2000);assert.equal(run.phase,'moon','canceled old timer cannot start flight');
 pull(1);assert.equal(run.departure38,null,'replayed cancel cannot start a fresh countdown');
 start.action();assert.equal(run.departure38,null,'cached start action cannot restart after cancellation');
 const restart=selection();assert.match(restart?.label,/take off/i);restart.action();hostNet.flush();assert.equal(run.departure38?.seconds,8);
 const cancel=selection();assert.match(cancel?.label,/cancel/i,'current selector exposes the cancellation action');
 cancel.action();hostNet.flush();assert.equal(run.departure38,null);
 cancel.action();assert.equal(run.departure38,null,'replayed cancellation action remains inert');
 selection().action();hostNet.flush();advance(8000);
 assert.equal(run.phase,'takeoff');assert.equal(peerRun.phase,'takeoff');assert.equal(doors.length,1,'only restarted earned countdown closes ship');
 advance(7000);assert.equal(flights,1,'one native flight completion callback after restart');
 console.log('PASS extraction39 native selector + two-Session start/cancel/restart, stale receipts and canceled timers');
 // Every rejected operator gets a fresh valid receipt, so these assertions
 // cannot pass merely because an old revision was already consumed.
 run.phase=peerRun.phase='moon';run.departure38=peerRun.departure38=null;doors.length=0;
 for(const pending of [false,true]){
  if(pending)pull(run.departure39Revision||0);
  const unchanged=run.departure38;
  for(const bad of ['unknown','disconnected','lost','dead','downed','bookDowned','far','belowFloor','wall','missingReceipt','wrongSeed','wrongEpoch','wrongRevision']){
  const revision=run.departure39Revision||0;
  let packet={token,revision},from='P',wall=null;
  remote.pos.set(-5.25,.05,.9);remote.dead=bad==='dead';remote.downed=bad==='downed';game.downed={isDowned:id=>bad==='bookDowned'&&id==='P'};
  if(bad==='unknown'){from='X';hostNet.players.set('X',{id:'X'});}
  if(bad==='disconnected')hostNet.players.delete('P');
  if(bad==='lost'){hostNet.transport.peers.delete('P');hostNet.peerGone('P',false);assert(hostNet.players.has('P'),'actual grace loss retains the admitted player');}
  if(bad==='far')remote.pos.set(4,.05,.9);
  if(bad==='belowFloor')remote.pos.y=-.6;
  if(bad==='wall')wall=physics.addStaticBox(-5.5,1,.9,.04,1,.4);
  if(bad==='missingReceipt')packet={};
  if(bad==='wrongSeed')packet.token='["extraction39","hamsi",38,1,"moon",0,0]';
  if(bad==='wrongEpoch')packet.token='["extraction39","hamsi",39,1,"moon",1,0]';
  if(bad==='wrongRevision')packet.revision=revision-1;
  physics.step(1/30);hostNet.receive({t:'req',d:{a:'lever',...packet}},from);
  if(bad==='lost'){clearTimeout(hostNet.lost.get('P')?.timer);hostNet.lost.delete('P');hostNet.transport.peers.add('P');}
  assert.equal(run.departure38,unchanged,bad+' cannot '+(pending?'cancel':'start')+' departure');
  assert.equal(doors.length,0,bad+' cannot close ship');
  if(wall)physics.world.removeCollider(wall,true);
  hostNet.players.delete('X');hostNet.players.set('P',{id:'P'});
  }
  remote.pos.set(-5.25,.05,.9);remote.dead=remote.downed=false;game.downed=null;physics.step(1/30);
 }
 pull(run.departure39Revision||0);assert.equal(run.departure38,null,'valid current cancellation still admitted after negative probes');
 pull(run.departure39Revision||0);assert.equal(run.departure38?.seconds,8,'valid current start still admitted after negative probes');
 console.log('PASS extraction39 known/live/standing/range/LOS and run/epoch/revision admission');
 assert.deepEqual(departureCrew39({aiPlayers:()=>[{pos:player.pos,inShip:false,dead:false}]}),{aboard:0,total:1,away:1},'banner trusts the exact native takeoff aboard predicate');
 const savedDocument=globalThis.document,nodes=[];let writes=0;
 globalThis.document={body:{appendChild(){}},createElement(){const n={style:new Proxy({},{set(o,k,v){writes++;o[k]=v;return true;}}),set textContent(v){writes++;this.text=v;},remove(){}};nodes.push(n);return n;}};
 let api;
 try{
  api=installCrew38(game);remote.pos.set(20,0,20);mods.emit('update',.016,game);
  assert.match(nodes[0].text,/1\/2.*aboard.*1.*away/i,'living crew count shows one person outside');
  const idle=writes;for(let i=0;i<60;i++)mods.emit('update',.016,game);assert.equal(writes,idle,'unchanged crew/countdown does not rewrite DOM');
  remote.pos.set(2.6,.05,4.1);assert.equal(insideShip(remote.pos),false);assert.equal(inDoorway(remote.pos),true);mods.emit('update',.016,game);
  assert.match(nodes[0].text,/2\/2.*aboard.*0.*away/i,'native doorway sill counts aboard exactly as takeoff');
  remote.dead=true;mods.emit('update',.016,game);assert.match(nodes[0].text,/1\/1.*aboard.*0.*away/i,'dead crew excluded from living boarding count');
  run.departure38=null;mods.emit('update',.016,game);assert.equal(nodes[0].style.display,'none');
 }finally{api?.dispose();globalThis.document=savedDocument;}
 console.log('PASS extraction39 cached banner living crew/doorway/death/cancel presentation');
 const migration=installHostMig(game);let broadcasts=0;const off=hostNet.on_('gs',()=>broadcasts++);
 try{
  remote.dead=false;run.phase='moon';
  hostNet.request('lever',leverReceipt39(game));hostNet.flush();
  const epochPending=run.departure38,epochBroadcasts=broadcasts;
  // A healthy third connection makes the actual module adopt a newer claim's
  // epoch while retaining host role: role-only checks cannot catch this case.
  hostNet.players.set('Z',{id:'Z'});hostNet.transport.peers.add('Z');
  hostNet.receive({t:'hmclaim',d:{e:hostNet.hostEpoch+1,r:0,o:['P','H','Z']}},'P');
  assert.equal(hostNet.isHost,true);assert.equal(hostNet.hostEpoch,1);
  advance(9000);
  assert.equal(epochPending.seconds,8,'old epoch callback cannot decrement authoritative countdown');
  assert.equal(broadcasts,epochBroadcasts,'old epoch callback cannot broadcast departure state');
  assert.equal(run.phase,'moon');assert.equal(flights,1);
  hostNet.request('lever',leverReceipt39(game));hostNet.request('lever',leverReceipt39(game));hostNet.flush();
  const demotedPending=run.departure38,demotedBroadcasts=broadcasts,oldDoors=doors.length;
  // Actual same-epoch live-host claim invokes HostMig.follow, clears hostData,
  // and flips Session's role while generic game.later timers still exist.
  hostNet.receive({t:'hmclaim',d:{e:hostNet.hostEpoch,r:0,o:['P','H','Z'],k:1}},'P');
  assert.equal(game.isHost,false);assert.equal(game.hostData,null);
  advance(9000);
  assert.equal(demotedPending.seconds,8,'demoted callback cannot mutate pending countdown');
  assert.equal(broadcasts,demotedBroadcasts,'demoted callback cannot broadcast countdown');
  assert.equal(doors.length,oldDoors);assert.equal(run.phase,'moon');assert.equal(flights,1);
  console.log('PASS extraction39 actual HostMig epoch adoption and same-epoch demotion invalidate pending callbacks');
 }finally{off?.();migration.dispose();hostNet.transport.peers.delete('Z');}
}finally{hostNet.transport.leave();peerNet.transport.leave();hostNet.clear();peerNet.clear();physics.world.free();}
