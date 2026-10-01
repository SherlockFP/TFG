// [labyrinths] node checks for the new labyrinth interiors (metro / greenhouse) + hero rooms + moon mapping:
//   every cell reachable from the entrance (locked doors closed), a fire exit exists, tunnel / alcoves exist, ALL vine plugs closed at once keep the
//   level connected, nav path entrance -> fire exit after the real build, hero rooms appear on the older themes, pure train rules.
//   node tools/harness/labyrinths.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));   // ui modules import .css
globalThis.window = globalThis;
const realWarn = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { generateLayout, buildFacility, THEMES } = await import('../../src/world/facility.js');
const { MOONS } = await import('../../src/game/moons.js');
const K = await import('../../src/game/expedition13_core.js');
const { planRelayVault,planSignalRun,buildFieldJob } = await import('../../src/world/expedition13.js');
const { dressDistrictReturn } = await import('../../src/world/districts13.js');
const { routeQ } = await import('../../src/game/routeboard_core.js');
await import('../../src/world/worlds2_data.js');   // registers the fixed moons (Panelka = tower)
let BOXES = null;
const mkPhysics = () => ({ addStaticBox(x, y, z, hx, hy, hz, rot) { const b = { x, y, z, hx, hy, hz, rot }; BOXES?.push(b); return b; }, removeCollider() {} });
const { checkStairs } = await import('../../src/world/stairs.js');
const lightPool = { add(e) { return e; }, remove() {} };
let fails = 0;
const bad = (m) => { fails++; realWarn('FAIL', m); };
const okc = (c, m) => { if (!c) bad(m); };



const { installExpedition13 } = await import('../../src/game/expedition13.js');
const THREE = await import('three');
const { Game } = await import('../../src/game/game.js');
let valid = null;
for (const seed of [1235,987,40417,777,31337,5150]) {
  const fac = buildFacility(generateLayout(seed,'factory',0.8),{physics:mkPhysics(),lightPool});
  const plan=planRelayVault(fac);
  if(plan) {
    for(const n of plan.nodes) okc(fac.nav.findPath(fac.mainDoor.spawn.x,fac.mainDoor.spawn.z,n.x,n.z,60000),'all relay routes walkable');
    if(!valid)valid={fac,plan,seed};else fac.dispose(mkPhysics());
  } else fac.dispose(mkPhysics());
}
okc(!!valid,'at least one generated bonus vault eligible');
realWarn('relay seed:',valid?.seed);
if(valid) {
 const {fac,plan,seed}=valid, handlers=new Map(), listeners=new Map(), messages=[];
 const p={id:'host',pos:plan.anchor.clone().add(new THREE.Vector3(0,-1.3,0)),zone:'in',dead:false};
 let noise=0,spawns=0;
 const game={run:{phase:'moon',moon:'hamsi',seed:seed|1,day:1,quotaIndex:1,credits:100,industry13:{robot:null,report:null}},world:{facility:fac},selfId:'host',isHost:true,time:0,
  player:{indoor:true,dead:false,pos:p.pos},aiPlayers:()=>[p],aiPlayerById:()=>p,
  net:{handlers,on(){},off(){},request(){},broadcast(k,d){messages.push([k,d]);},sendTo(k,e,d){messages.push([e,d]);}},
  mods:{on(k,fn){listeners.set(k,fn);return()=>listeners.delete(k);}},broadcastRun(){},items:{hostSpawn(){spawns++;return 'parcel'+spawns;}},creatures:{noise(){noise++;}},
  physics:mkPhysics(),audio:{at(){}},doorById:id=>fac.doors.find(d=>d.id===id),onDoor:Game.prototype.onDoor,updateDoors:Game.prototype.updateDoors,
  hostSetDoor(id,open){this.onDoor({id,open,locked:this.doorById(id).locked});},doorInteraction(){return {};},
 };
 // Core host request fallbacks should not bypass the newly dedicated gate.
 handlers.set('vault',()=>{fac.doors.find(d=>d.id===plan.door.id).locked=false;});
 const api=installExpedition13(game);listeners.get('registerHandlers')((k,fn)=>handlers.set(k,fn),game);listeners.get('mapLoaded')(game.world,game);
 okc(api.plan()?.kind==='vault','one real vault job chosen');
 const st=api.state(), token=st.token, request=(op,i)=>{game.time++;handlers.get('e13req')({token,op,i},p.id);};
 handlers.get('vault')({id:plan.door.id},p.id);okc(plan.door.locked,'keypad bypass denied');
 game.run.descent21={depth:1};request('accept');okc(!st.accepted,'old surface vault cannot start on another floor');game.run.descent21.depth=0;
 request('accept');okc(st.accepted,'job explicitly accepted');
 const original=p.pos.clone();p.pos.x+=100;request('relay',0);okc(st.values[0]===0,'remote relay exploit denied');p.pos.copy(original);
 game.run.industry13.robot={};request('robot');okc(!st.drone&&game.run.credits===100,'busy scout denied');game.run.industry13.robot=null;
 request('robot');request('robot');okc(!!st.drone&&game.run.credits===65,'drone service charged once');
 listeners.get('update')(100,game);okc(!st.done&&st.drone.elapsed===.25,'large delta cannot instant-solve');
 for(let i=0;i<119;i++)listeners.get('update')(.25,game);
 okc(st.values[0]&&st.values[1]&&!st.values[2]&&!plan.door.open,'robot checking stages do not open early');
 game.run.phase='orbit';for(let i=0;i<200;i++)listeners.get('update')(.25,game);okc(!st.done,'off-map time gives no progress');game.run.phase='moon';
 for(let i=0;i<60;i++)listeners.get('update')(.25,game);
 okc(st.done&&plan.door.open&&!plan.door.locked,'45 active seconds permanently open gate');
 okc(!fac.nav.blockedEdges.has(plan.door.info.key),'door nav edge released');
 game.updateDoors(2);okc(!plan.door.collider,'actual gate collider released by normal animation');
 request('robot');okc(game.run.credits===65,'completed gate cannot repeat service');
 // Same-map late peer/map reload retains completion and opens its matching gate.
 listeners.get('mapLoaded')(game.world,game);okc(api.state().done&&api.plan().door.open,'same-map completion retained');
 game.run.descent21.depth=1;listeners.get('facilityWillChange')(game.world,game,1);okc(!api.plan(),'old vault geometry cleared before streaming');game.run.descent21.depth=0;listeners.get('facilityChanged')(game.world,game,0);okc(api.state()===st&&api.state().done,'surface vault keeps the same finite completion ledger');request('robot');okc(game.run.credits===65,'surface return never recharges completed robot service');
 listeners.get('phase')('orbit',game);okc(game.run.expedition13===null,'orbit clears job and robot lease');
 game.run.seed=1234;game.run.expedition13=K.createFieldJob('hamsi:1234:1','signal');game.world={terrain:{pathPts:Array.from({length:25},(_,i)=>({x:0,z:i*4})),heightAt:()=>0},outdoor:{group:new THREE.Group(),solidAt:()=>false}};
 listeners.get('mapLoaded')(game.world,game);const signalPlan=api.plan(),signalState=api.state();
 okc(signalPlan?.kind==='signal','same installer supports outdoor job');
 p.zone='out';p.pos.copy(signalPlan.anchor).y-=1.3;
 const signalRequest=(op,i)=>{game.time++;handlers.get('e13req')({token:signalState.token,op,i},p.id);};
 signalRequest('accept');
 handlers.get('e13req')({token,op:'relay',i:0},p.id);okc(!signalState.values[0],'old map token rejected');
 for(const n of signalPlan.nodes) {p.pos.set(n.x,n.y-1.3,n.z);while(signalState.dials[n.i]!==K.bandTarget(1234,n.i))signalRequest('dial',n.i);signalRequest('seal',n.i);}
 p.pos.copy(signalPlan.anchor).y-=1.3;signalRequest('parcel');signalRequest('parcel');
 okc(signalState.parcel&&spawns===1&&game.run.credits===65,'one physical parcel, no direct or repeated cash');
 api.dispose();fac.dispose(mkPhysics());
}
const signal=K.createFieldJob('s','signal');signal.accepted=true;
for(const i of [2,0,1]) {while(signal.dials[i]!==K.bandTarget(7,i))K.tuneFieldJob(signal,i,'dial',7);K.tuneFieldJob(signal,i,'seal',7);}
okc(signal.done&&!K.tuneFieldJob(signal,0,'seal',7).ok,'signal calibration finite and solo-compatible');
const terrain={pathPts:Array.from({length:25},(_,i)=>({x:0,z:i*4})),heightAt:()=>0};
const fakeWorld={terrain,outdoor:{group:new THREE.Group(),solidAt:()=>false}};
const signalPlan=planSignalRun(fakeWorld);okc(signalPlan?.nodes.length===3,'path-based outdoor job exists');
const decoration=buildFieldJob(signalPlan);okc(decoration.children.length<=4,'decoration uses bounded merged materials');
terrain.hook={};okc(!planSignalRun(fakeWorld),'floating/moon custom terrain skipped');
realWarn(`expedition13: ${fails?'FAIL':'PASS'} (${fails} failures)`);process.exitCode=fails?1:0;
