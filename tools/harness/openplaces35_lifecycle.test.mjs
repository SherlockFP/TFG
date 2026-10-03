// NATIVE_INTEGRATION: actual host lever, Session self/peer phase, Game phase and
// native map/descent owners. The starting orbit and weekly seed are setup.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import {register} from 'node:module';
import {Emitter} from '../../src/core/events.js';
import {Session} from '../../src/net/session.js';
import {hostMethods} from '../../src/game/host.js';
import {MOONS} from '../../src/game/moons.js';
import {newDescent,chooseSafeFloor} from '../../src/game/descent21_state.js';
import {savedFloorSpec} from '../../src/game/descent21_core.js';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {Game}=await import('../../src/game/game.js');
const hostNet=new Session({strategy:'local',isHost:true,code:'open35'}),peerNet=new Session({strategy:'local',isHost:false,code:'open35'});
hostNet.selfId=hostNet.hostId='H';peerNet.selfId='P';peerNet.hostId='H';hostNet.transport.peers.add('P');
const builds=[];
function game(net){return {net,selfId:net.selfId,isHost:net.isHost,run:{phase:'orbit',moon:'hamsi',seed:2,day:1,daysLeft:3,quotaIndex:0},hostData:{},player:{inShip:true},remotes:new Map(),mods:new Emitter(),ship:{door:{setOpen(){}}},audio:{play(){}},engine:{shake(){}},ui:{hud:{bigText(){}}},items:{inShipItems:()=>[]},meta:{weekly:{hostOnLever:r=>{r.seed=1235;}}},freshDayStats:()=>({}),later(){},markRunSent(){},hostAnnounce(){},hostSetPhase:hostMethods.hostSetPhase,applyRunState(d){Object.assign(this.run,d);},loadMapFor(run){
  // Runs synchronously inside the real Game phase callback, before any gs.
  assert.deepEqual(run.openPlaces35,{version:35,token:'hamsi:1235:1',kind:'courtyard'},'receipt must reach the actual build callback after weekly seed selection');
  builds.push({id:net.selfId,receipt:structuredClone(run.openPlaces35)});
},updateAmbience(){},tutorialHint(){}};}
const host=game(hostNet),peer=game(peerNet);
hostNet.on_('phase',d=>Game.prototype.onPhase.call(host,d));peerNet.on_('phase',d=>Game.prototype.onPhase.call(peer,d));
hostNet.transport.send=(m,to)=>{if(!to||to==='P')peerNet.receive(m,'H');};
try {
  hostMethods.hostLever.call(host,'H');hostNet.flush();
  assert.equal(builds.length,2,'both actual Session phase callbacks enter the map build');
  assert.deepEqual(peer.run.openPlaces35,host.run.openPlaces35);
  console.log('PASS native host/self/peer phase receipt precedes synchronous build');
} finally {hostNet.transport.leave();peerNet.transport.leave();hostNet.clear();peerNet.clear();}

const {surfaceOptions35,interiorViewFar35}=await import('../../src/game/openplaces35.js');
const run={moon:'hamsi',seed:1235,day:1,openPlaces35:builds[0].receipt},opts={variant:'atrium'};
assert.equal(surfaceOptions35({...run,openPlaces35:null},MOONS.hamsi,opts),opts,'old map options keep their exact identity');
assert.equal(surfaceOptions35({...run,seed:9},MOONS.hamsi,opts),opts,'stale receipt cannot change a new map');
assert.equal(surfaceOptions35({...run,moon:'hq'},MOONS.hq,opts),opts,'company cannot opt in');
assert.deepEqual(surfaceOptions35(run,MOONS.hamsi,opts),{...opts,open35:{version:35,kind:'courtyard'}});assert.deepEqual(opts,{variant:'atrium'});
const st=newDescent(run),old=newDescent({...run,openPlaces35:null});assert.equal(st.routeVersion,35);assert.equal(old.routeVersion,26);
const probes=[];const selected=chooseSafeFloor(MOONS.hamsi,1235,3,(d,c)=>{probes.push(c);return probes.length===3?{certified:true}:null;},{routeVersion:st.routeVersion});
assert.equal(selected.choice.theme,'backrooms');assert.equal(probes.length,3);
for(const c of probes)assert.deepEqual(c.layoutOpts,{open35:{version:35,kind:'reception'}},'all native safety retries retain the announced open place');
st.depth=3;st.currentChoice=selected.choice;const spec=savedFloorSpec(MOONS.hamsi,1235,st);
assert.deepEqual(spec.layoutOpts,selected.choice.layoutOpts);
old.depth=3;assert.equal(savedFloorSpec(MOONS.hamsi,1235,old).layoutOpts,undefined,'old route26 checkpoint remains exact');
assert.equal(savedFloorSpec(MOONS.hamsi,1235,{...old,routeVersion:21}).liminal,false);
console.log('PASS legacy receipt identity and actual descent state/safety retries/checkpoint options');

let occupied=true;const fac={viewFar:96,layout:{open35:{version:35}},contains:()=>occupied},p={indoor:true,pos:{},dead:false};
assert.equal(interiorViewFar35(fac,p,true,240),96);occupied=false;assert.equal(interiorViewFar35(fac,p,true,240),46);
occupied=true;assert.equal(interiorViewFar35(fac,{...p,indoor:false},false,240),240);
assert.equal(interiorViewFar35(null,p,true,240),46);assert.equal(interiorViewFar35({...fac,viewFar:Infinity},p,true,240),46);
console.log('PASS current occupied indoor facility bounds camera range; stale/outdoor/unloaded legacy scope');

// Actual Game queued publication and actual Descent21 isolated preflight/live
// replacement/return. Rendering boundary is a stub; native maps/Rapier are real.
const THREE=await import('three');
const {Physics,initPhysics}=await import('../../src/physics/physics.js');
const {LightPool}=await import('../../src/render/lightpool.js');
const {ItemManager}=await import('../../src/entities/items.js');
const {installLandQ}=await import('../../src/game/landingq.js');
const {installDescent21}=await import('../../src/game/descent21.js');
await initPhysics();
for(const admitted of [false,true]){
 const scene=new THREE.Scene(),physics=new Physics(),lights=new LightPool(scene),mods=new Emitter();
 const g=Object.assign(Object.create(Game.prototype),{scene,physics,lights,mods,time:0,profile:{},config:{},world:{moonId:null},run:{...run,phase:'landing',weather:'clear',openPlaces35:admitted?run.openPlaces35:null},env:{indoor:false,setMoon(){},setSpace(){}},player:{pos:new THREE.Vector3(),dead:false},creatures:{host:new Map(),views:new Map(),clearAll(){}},net:{selfId:'P',hostId:'H',isHost:false,on_(){},off(){}},engine:{scene,camera:new THREE.PerspectiveCamera(),renderer:{compile(){},initTexture(){},getRenderTarget(){return null;},setRenderTarget(){}}}});
 g.items=new ItemManager(g);g.landQ=installLandQ(g);g.landQ.startDelay=0;g.descent21=installDescent21(g);
 let seen=0;mods.on('mapLoaded',()=>{seen++;assert(g.world.facility?.nav&&g.world.outdoor?.terrain);assert.equal(!!g.world.facility.layout.open35,admitted);});
 try{
  g.loadMapFor(g.run,false);assert.equal(g.world.facility,undefined,'detached queued facility is not published early');g.landQ.flush();assert.equal(seen,1);
  const original=g.world.facility;const gen=structuredClone(original.descent21Generation);assert.equal(!!gen.layoutOpts?.open35,admitted);
  g.run.phase='moon';g.run.descent21=newDescent(g.run);g.run.descent21.surface={gen};
  g.run.descent21.depth=3;g.run.descent21.currentChoice={...selected.choice};if(!admitted)delete g.run.descent21.currentChoice.layoutOpts;
  assert(g.descent21.onState(),'actual depth peer state invokes certified preflight and streamed rebuild');assert.notEqual(g.world.facility,original);assert.equal(!!g.world.facility.layout.open35,admitted);assert.equal(g.world.descent21Depth,3);
  assert.deepEqual(g.world.facility.descent21Generation.layoutOpts,admitted?selected.choice.layoutOpts:undefined);
  g.run.descent21.depth=0;g.run.descent21.currentChoice=null;assert(g.descent21.onState());assert.equal(!!g.world.facility.layout.open35,admitted);assert.equal(g.world.descent21Depth,0);assert.deepEqual(g.world.facility.descent21Generation,gen);
  console.log('PASS actual Game queued build and certified Descent peer preflight/live/surface return',admitted?'new35':'old26');
 }finally{g.descent21.dispose();g.unloadMap();g.items.dispose();g.landQ.dispose();assert.equal(physics.info.size,0);assert.equal(lights.emitters.size,0);physics.dispose();mods.clear();}
}
