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

import assert from 'node:assert/strict';
const THREE=await import('three');
const { generateLayout,buildFacility }=await import('../../src/world/facility.js');
const { Game }=await import('../../src/game/game.js');
const { planArchive14,installMissions14 }=await import('../../src/game/missions14.js');
const physics={addStaticBox(){return{};},removeCollider(){}}, lightPool={add:e=>e,remove(){}};
let chosen;
for(const seed of [4,8,12,16,20,24,28,32]){
 const fac=buildFacility(generateLayout(seed,'factory',.8),{physics,lightPool}),run={moon:'hamsi',phase:'moon',seed,day:1,quotaIndex:2};
 const plan=planArchive14({facility:fac},run);
 if(plan&&!chosen)chosen={fac,run,plan};else fac.dispose(physics);
}
assert(chosen,'a reachable generated vault room is available');
const {fac,run,plan}=chosen,handlers=new Map(),events=new Map(),all=new Map();let count=0,bossCount=0;
const player={id:'host',pos:plan.anchor.clone().add(new THREE.Vector3(0,-1.3,0)),zone:'in',dead:false,downed:false};
const game={audio:{at(){}},run,world:{facility:fac},isHost:true,selfId:'host',physics,player:{indoor:true,dead:false,pos:player.pos},aiPlayers:()=>[player],aiPlayerById:()=>player,
 mods:{itemModels:new Map(),creatureModels:new Map([['keyholder',()=>({root:new THREE.Group()})]]),on(k,fn){events.set(k,fn);return()=>{};}},net:{handlers,broadcast(k,d){if(k==='it'&&d.e==='rm')all.delete(d.id);},sendTo(){},request(){}},broadcastRun(){},creatures:{host:new Map()},escape14:{active:()=>false},
 items:{hostSpawn(type,pos,opts){const id='item'+(++count);all.set(id,{id,type,pos,opts,holder:null});return id;},get:id=>all.get(id)},
 cycle:{bosses:{spawnBoss(type,pos,opts){bossCount++;assert.equal(type,'keyholder');assert.equal(opts.crew,1);return{id:'guard1'};}}},
 doorById:id=>fac.doors.find(d=>d.id===id),onDoor:Game.prototype.onDoor,updateDoors:Game.prototype.updateDoors,
 hostSetDoor(id,open){this.onDoor({id,open,locked:this.doorById(id).locked});},doorInteraction(){return{};},hostOnCreatureKilled(){},
};
const api=installMissions14(game);let warm=0;events.get('warm')(()=>warm++,game);assert.equal(warm,3);realWarn('archive fixture seed:',run.seed);events.get('mapLoaded')(game.world,game);warm=0;events.get('warm')(()=>warm++,game);assert.equal(warm,3);events.get('registerHandlers')((k,fn)=>handlers.set(k,fn),game);
const send=op=>handlers.get('m14req')({token:`${run.moon}:${run.seed}:${run.day}`,op},'host');
const before=fac.doors.map(d=>[d.id,d.open,d.locked]);
assert.equal(planArchive14({facility:fac},{...run,quotaIndex:1}),null);
handlers.get('m14req')({token:'stale',op:'accept'},'host');assert.equal(count,0);
send('accept');send('accept');assert.equal(count,1);assert.equal(api.state().stage,'cell');
assert(fac.nav.findPath(fac.mainDoor.spawn.x,fac.mainDoor.spawn.z,api.plan().cellPos.x,api.plan().cellPos.z,60000));
send('install');assert.equal(bossCount,0);all.get(api.state().cellId).holder='host';
game.escape14.active=()=>true;send('install');assert.equal(bossCount,0);game.escape14.active=()=>false;
send('install');assert.equal(bossCount,1);assert.equal(api.state().stage,'guard');assert.equal(all.size,0);
assert(fac.nav.findPath(fac.mainDoor.spawn.x,fac.mainDoor.spawn.z,api.plan().bossPos.x,api.plan().bossPos.z,60000),'gate nav edge really released');
assert(fac.nav.findPath(api.plan().bossPos.x,api.plan().bossPos.z,fac.mainDoor.spawn.x,fac.mainDoor.spawn.z,60000),'retreat route preserved');
for(const d of fac.doors)if(d.id!==api.plan().door.id)assert.deepEqual([d.id,d.open,d.locked],before.find(b=>b[0]===d.id));
send('cache');assert.equal(count,1);game.hostOnCreatureKilled({id:'other',dead:true},'host');assert.equal(api.state().stage,'guard');
game.hostOnCreatureKilled({id:'guard1',dead:true},'host');assert.equal(api.state().stage,'won');player.pos.copy(api.plan().bossPos);send('cache');send('cache');assert.equal(count,2);assert.equal([...all.values()][0].opts.value,180);
events.get('phase')('orbit',game);assert.equal(game.run.mission14,null);assert.equal(api.plan(),null);api.dispose();fac.dispose(physics);
realWarn('missions14: real vault routes, opt-in finite cell, holder validation, escape guard, one shared boss, exact death reward and phase cleanup passed');
