// Explicit native fixture setup; no behavior results or second simulation clock.
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {initPhysics,Physics,RAPIER,G,groups} from '../../src/physics/physics.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {LocalPlayer} from '../../src/entities/localplayer.js';
import {ItemManager} from '../../src/entities/items.js';
import {Session} from '../../src/net/session.js';
import {hostMethods} from '../../src/game/host.js';
import {newDescent} from '../../src/game/descent21_state.js';
import {installCreatures32} from '../../src/game/creatures32.js';

const quaternion={x:0,y:0,z:0,w:1};
const expect32=(condition,message)=>{if(!condition)throw new Error(`creatures32 fixture: ${message}`);};
const canvas=()=>({width:64,height:64,style:{},getContext:()=>new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:10}):(k==='createImageData'||k==='getImageData')?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true})});
function clearAt(game,p,r=.5,h=1.9){
 const physics=game.physics,shape=new RAPIER.Capsule(h/2-r,r);
 if(!game.world.facility.nav.walkableAt(p.x,p.z))return false;
 const floor=physics.raycast({x:p.x,y:p.y+.2,z:p.z},{x:0,y:-1,z:0},.4,G.STATIC);
 if(!floor||floor.normal.y<.8)return false;
 return !physics.world.intersectionWithShape({x:p.x,y:p.y+h/2+.04,z:p.z},quaternion,shape,undefined,groups(0xffff,G.STATIC|G.DOOR));
}
export function selectArena32(game){
 const fac=game.world.facility,L=fac.layout,nav=fac.nav;
 for(const room of L.rooms){
  if(room.type==='entrance')continue;
  for(let z=room.z*L.cell+L.oz+1.5;z<(room.z+room.h)*L.cell+L.oz-1;z+=1)
   for(let x=room.x*L.cell+L.ox+1.5;x<(room.x+room.w)*L.cell+L.ox-1;x+=1)
    for(const axis of [[0,1],[1,0],[0,-1],[-1,0]]){
     const start=new THREE.Vector3(x,L.y,z),at=(forward,side=0)=>new THREE.Vector3(x+axis[0]*forward+axis[1]*side,L.y,z+axis[1]*forward-axis[0]*side);
     if(start.distanceTo(fac.mainDoor.pos)<15)continue;
     const points=[];for(let d=0;d<=7;d+=.5)points.push(at(d));
     for(const d of [2,4,6])for(const side of [-1.8,1.8])points.push(at(d,side));
     if(!points.every(p=>clearAt(game,p)))continue;
     if(!points.every(p=>physicsLOS(game,start,p)))continue;
     const route=nav.findPath(fac.mainDoor.spawn.x,fac.mainDoor.spawn.z,x,z);
     if(!route?.length)continue;
     return{seed:L.seed,theme:L.theme,size:1.3,room:room.id??L.rooms.indexOf(room),ramStart:start,dormantStart:at(3),playerStart:at(6),quietBypass:at(6,1.8),left:at(6,-1.8),right:at(6,1.8),panel:at(3),axis:new THREE.Vector3(axis[0],0,axis[1]),yaw:Math.atan2(axis[0],axis[1]),at,route};
    }
 }
 throw new Error('seed1235 factory1.3 has no physically clear 7m lane / two side exits / native return path');
}
function physicsLOS(game,a,b){return game.physics.lineOfSight({x:a.x,y:a.y+1,z:a.z},{x:b.x,y:b.y+1,z:b.z});}
export async function makeNativeArena32(){
 await initPhysics();const oldDocument=globalThis.document,oldWindow=globalThis.window;
 if(!globalThis.document)globalThis.document={createElement:()=>canvas()};
 delete globalThis.window;
 const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
 const physics=new Physics(),scene=new THREE.Scene(),layout=generateLayout(1235,'factory',1.3),fac=buildFacility(layout,{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);
 for(let i=0;i<4;i++)physics.step(1/60);
 globalThis.window={__kefalMods:{itemModels:new Map(),creatureModels:new Map()},KefalAPI:{THREE}};
 const net=new Session({strategy:'local',isHost:true,code:'native32'});net.selfId=net.hostId='crew';net.players.set('crew',{id:'crew'});
 const hits=[],messages=[],audioCalls=[],players=[];
 const run={phase:'moon',moon:'hamsi',seed:1235,day:1,quotaIndex:2,time:480};run.descent21=newDescent(run);run.descent21.depth=3;
 const game={isHost:true,selfId:'crew',scene,engine:{scene,camera:new THREE.PerspectiveCamera()},world:{facility:fac},physics,mods:new Emitter(),run,time:0,config:{creatures32:false},hostData:{powerUsed:0},net,
  audio:{has:()=>true,play(id,opts){audioCalls.push({id,opts});return{stop(){}};}},settings:{},remotes:new Map(),stats:{},onItemHeld(){},onItemDropped(){},
  aiPlayers:()=>players,aiPlayerById:id=>players.find(p=>p.id===id),downed:{isDowned:id=>!!players.find(p=>p.id===id)?.downed},
  indoorBudget:()=>20,hostEarlySafeFilter:()=>null,rollLevel:()=>1,rollElite:()=>false,hostSpawnCreatureIndoor:hostMethods.hostSpawnCreatureIndoor,broadcastRun:hostMethods.broadcastRun,
  hostHurtPlayer(id,dmg,cause,source){hits.push({id,dmg,cause,source,time:game.time});game.onHit?.();},later(){},hostSetDoor(id,open){fac.doors.find(d=>d.id===id)?.setOpen(open,physics);}};
 const manager=game.creatures=new CreatureManager(game),items=game.items=new ItemManager(game),api=installCreatures32(game);
 net.on_('cev',d=>{messages.push({k:'cev',d:structuredClone(d)});manager.onEvent(d);game.onSpawnEvent?.(d);});net.on_('it',d=>items.onEvent(d));net.on_('gs',d=>messages.push({k:'gs',d:structuredClone(d)}));
 const fixture=selectArena32(game),local=game.player=new LocalPlayer(game);local.teleport(fixture.playerStart,fixture.yaw);local.inShip=false;
 const player={id:'crew',zone:'in',pos:local.pos,eye:new THREE.Vector3(),look:local.forward(),noise:0,voice:0,flash:false,dead:false,downed:false,inShip:false};players.push(player);
 const syncEye=()=>player.eye.copy(local.pos).add(new THREE.Vector3(0,1.62,0));syncEye();
 const step=(dt=1/60)=>{physics.step(dt);game.time+=dt;manager.hostUpdate(dt);net.flush();};
 const advance=seconds=>{for(let elapsed=0;elapsed<seconds-1e-8;){const dt=Math.min(1/60,seconds-elapsed);step(dt);elapsed+=dt;}};
 function walkPlayerTo(goal,speed=4.8){
  let n=0;while(local.pos.distanceTo(goal)>.09&&n++<600){const dx=goal.x-local.pos.x,dz=goal.z-local.pos.z,len=Math.hypot(dx,dz),s=Math.min(len,speed/60);
   local.ctrl.computeColliderMovement(local.col,{x:dx/len*s,y:-.05,z:dz/len*s},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const mv=local.ctrl.computedMovement(),bp=local.body.translation();
   local.body.setNextKinematicTranslation({x:bp.x+mv.x,y:bp.y+mv.y,z:bp.z+mv.z});local.pos.set(bp.x+mv.x,bp.y+mv.y-.9,bp.z+mv.z);syncEye();step();
  }expect32(local.pos.distanceTo(goal)<.12,'native local controller reaches fixture input goal');
 }
 function setupPlayer(p=fixture.playerStart){local.teleport(p,fixture.yaw);player.look.copy(local.forward());syncEye();physics.step(1/60);}
 function spawn(type,opts={}){return CreatureManager.prototype.hostSpawn.call(manager,type,(type==='c32_ram'?fixture.ramStart:fixture.dormantStart),{zone:'in',level:1,elite:false,variant:null,affix:null,tier:null,yaw:fixture.yaw,...opts});}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;api.dispose();manager.clearAll();for(const it of items.all())it.dispose();items.items.clear();items.dispose();physics.world.removeCharacterController(local.ctrl);physics.removeBody(local.body);fac.dispose(physics);physics.dispose();net.transport.leave();net.clear();globalThis.document=oldDocument;globalThis.window=oldWindow;}
 return{game,physics,manager,items,fixture,player,players,local,hits,messages,audioCalls,api,step,advance,walkPlayerTo,setupPlayer,spawn,dispose};
}
export function prepareBrowserArena32(game,type){
 expect32(game.world.facility.layout.seed===1235,'browser setup requires fixed seed1235');expect32(game.world.facility.layout.theme==='factory','browser setup requires factory geometry');expect32(['c32_dormant','c32_ram'].includes(type),'known native type');
 const fixture=selectArena32(game);game.player.teleport(fixture.playerStart,fixture.yaw);
 const c=CreatureManager.prototype.hostSpawn.call(game.creatures,type,type==='c32_ram'?fixture.ramStart:fixture.dormantStart,{zone:'in',level:1,elite:false,variant:null,affix:null,tier:null,yaw:fixture.yaw});
 const cleanup=()=>{if(c)game.creatures.hostRemove(c.id);};cleanup.fixture=fixture;cleanup.creatureId=c?.id;return cleanup;
}
