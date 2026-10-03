// NATIVE_INTEGRATION: real ship, Rapier, Session host self delivery, native
// countdown and the actual legacy preflight/voyage wrappers. Controlled timer
// and cockpit start are explicit setup; this is not an earned walk/playtest.
import assert from 'node:assert/strict';
import {nativeCockpit39} from './extraction39_cockpit.mjs';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {hostMethods} from '../../src/game/host.js';
import {leverReceipt39} from '../../src/game/extraction39.js';
import {installShipFaults} from '../../src/game/shipfaults.js';
import {installVoyage} from '../../src/game/voyage.js';
import * as V from '../../src/game/voyage_core.js';
import {ItemManager} from '../../src/entities/items.js';
import {installCargo13} from '../../src/game/cargo13.js';
import {CUSTODY} from '../../src/game/cargo13_core.js';
import * as THREE from 'three';

const cockpit=await nativeCockpit39(),net=new Session({strategy:'local',isHost:true,code:'extraction39-wrappers'}),mods=new Emitter(),timers=[];
net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
let now=0,seq=0,flights=0,closed=0;
const game={net,mods,physics:cockpit.physics,scene:cockpit.scene,ship:cockpit.ship,player:cockpit.player(),selfId:'H',isHost:true,remotes:new Map(),config:{shipFaults:true},
 run:{runId:'extraction39-wrappers',phase:'moon',moon:'hamsi',seed:39,day:1,quotaIndex:1},world:{facility:null},hostData:{},items:{get:()=>null,all:()=>[],inShipItems:()=>[],hostSpawn(){}},
 hostLever:hostMethods.hostLever,hostBeginTakeoff:hostMethods.hostBeginTakeoff,hostSetPhase:hostMethods.hostSetPhase,broadcastRun:hostMethods.broadcastRun,
 hostFinishTakeoff(){flights++;},sfx(){},animLever(){},hostAnnounce(){},markRunSent(){},hostSave(){},later(fn,ms){timers.push({at:now+ms,seq:seq++,fn});},
};
net.on_('gs',d=>Object.assign(game.run,d));net.on_('phase',d=>Object.assign(game.run,d));net.on_('door',()=>closed++);
hostMethods.registerHandlers.call(game);
const pull=()=>{net.request('lever',leverReceipt39(game));net.flush();};
function advance(ms){const end=now+ms;while(true){timers.sort((a,b)=>a.at-b.at||a.seq-b.seq);if(!timers.length||timers[0].at>end)break;const t=timers.shift();now=t.at;t.fn();}now=end;net.flush();}
let faults,voyage,cargo;
const savedWindow=globalThis.window;
try{
 // A repaired fault launches through its captured original handler. Put the
 // initial pending native countdown in that same position before installation.
 game.hostBeginTakeoff('lever');faults=installShipFaults(game);
 pull();
 assert.equal(game.run.departure38,null,'real fault wrapper forwards cancellation to native countdown');
 assert.equal(faults.active(),false,'cancellation cannot roll fresh preflight faults');
 advance(8000);assert.equal(game.run.phase,'moon','abandoned timer stays inert through fault wrapper');
 faults.begin('lever',['fuel']);assert.equal(faults.active(),true,'preflight itself still blocks departure');
 faults.launch();assert.equal(game.run.departure38?.seconds,8,'actual preflight release starts native crew warning');
 advance(8000);
 assert.equal(game.run.phase,'takeoff','crew warning expiry passes preflight only once');
 assert.equal(faults.active(),false,'crew warning expiry cannot roll a second fault event');
 assert.equal(closed,1);advance(7000);assert.equal(flights,1);
 console.log('PASS extraction39 actual preflight wrapper cancellation, repaired launch and single expiry');
 game.run.phase='moon';game.run.departure38=null;game.config.shipFaults=false;
 // Headless voyage has no keyboard surface; its real Session bindings, mission
 // state machine and wrappers are installed in native game order after faults.
 delete globalThis.window;voyage=installVoyage(game);voyage.state();
 game.run.vy.mission={...V.newMission({id:'photo:hamsi:39',type:'photo',moon:'hamsi',tier:1,n:1,pay:90,xp:60,loot:'wood',comps:0},1),st:'active'};
 const mission=game.run.vy.mission;
 pull();assert.equal(game.run.departure38?.seconds,8);
 assert.equal(game.run.vy.mission,mission,'starting native warning leaves mission open until accepted departure');
 pull();assert.equal(game.run.departure38,null);
 assert.equal(game.run.vy.mission,mission,'cancellation through actual voyage wrapper cannot finalize an active mission');
 assert.equal(game.run.vy.mission.st,'active');
 pull();advance(8000);assert.equal(game.run.phase,'takeoff');
 assert.equal(game.run.vy.mission.st,'failed','actual completed departure still finalizes the mission');
 game.run.phase='moon';game.run.vy.mission={...mission};game.hostBeginTakeoff('midnight');
 assert.equal(game.run.phase,'moon');assert.equal(game.run.vy.mission.st,'active','ignored automatic departure cannot fail mission');
 game.hostBeginTakeoff('alldead');assert.equal(game.run.phase,'takeoff');assert.equal(game.run.vy.mission.st,'failed','immediate accepted departure preserves finalization');
 console.log('PASS extraction39 actual voyage wrapper preserves start/cancel and finalizes accepted departure only');
 game.run.phase='moon';game.run.departure38=null;game.run.vy.mission=null;game.world={moonId:'hamsi',seed:39};
 globalThis.window={removeEventListener(){}};
 game.ui={toast(){}};game.engine={scene:cockpit.scene};game.items=new ItemManager(game);game.onItemHeld=game.onItemDropped=()=>{};
 game.aiPlayerById=id=>id==='H'?{id,pos:game.player.pos,dead:game.player.dead,inShip:game.player.inShip}:null;
 net.on_('it',d=>game.items.onEvent(d));
 game.run.cargo13={map:'hamsi:39:1:',p:[-4,.05,.9],yaw:0,driver:null,ids:[]};
 cargo=installCargo13(game);hostMethods.registerHandlers.call(game);mods.emit('mapLoaded',game.world);
 pull();assert.equal(game.run.departure38?.seconds,8);
 const itemId=game.items.hostSpawn('iron',new THREE.Vector3(-4,.7,.9),{value:123,tier:'common'}),item=game.items.get(itemId);
 net.request('cg13act',{op:'load',id:itemId});
 assert.equal(item.holder,CUSTODY,'real cart request loads native item custody during boarding warning');
 assert.deepEqual(game.run.cargo13.ids,[itemId]);
 pull();assert.equal(game.run.departure38,null);
 assert.equal(item.holder,CUSTODY,'cancellation cannot unload native trolley item');
 assert.deepEqual(game.run.cargo13.ids,[itemId]);assert.equal(item.value,123);
 pull();assert.equal(item.holder,null,'fresh departure retains existing trolley release behavior');
 assert.deepEqual(game.run.cargo13.ids,[]);advance(8000);assert.equal(game.run.phase,'takeoff');
 console.log('PASS extraction39 actual Cargo13 load/cancel preserves native custody and restart release');
}finally{
 cargo?.dispose();voyage?.dispose();faults?.dispose();game.items.clearAll?.();game.items.dispose?.();globalThis.window=savedWindow;net.transport.leave();net.clear();cockpit.dispose();
}
