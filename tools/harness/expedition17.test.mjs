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

const assert=(await import('node:assert/strict')).default;
const THREE=await import('three');
const {ItemManager}=await import('../../src/entities/items.js');
const {installExpedition13}=await import('../../src/game/expedition13.js');
const {createFieldJob}=await import('../../src/game/expedition13_core.js');
const {planField17}=await import('../../src/world/expedition13.js');
const {tickField17}=await import('../../src/game/expedition17_core.js');
function fixture(seed=2,host=true){
 const listeners=new Map(),handlers=new Map(),items=new Map(),events=[];let serial=0,wall=false,failSpawn=false;
 const p={id:'host',pos:new THREE.Vector3(),zone:'out',noise:0,voice:0,dead:false},peer={...p,id:'peer',pos:new THREE.Vector3()};
 const world={terrain:{pathPts:Array.from({length:25},(_,i)=>({x:0,z:16+i*4})),heightAt:()=>0},outdoor:{group:new THREE.Group(),solidAt:()=>false}};
 const g={run:{phase:'moon',moon:'hamsi',seed,day:1,quotaIndex:1,credits:100},world,isHost:host,selfId:'host',time:0,player:{pos:p.pos,indoor:false},aiPlayers:()=>[p,peer],aiPlayerById:id=>id==='peer'?peer:p,
 mods:{itemModels:new Map(),on(k,f){listeners.set(k,f);return()=>listeners.delete(k)},emit(...x){events.push(x)}},physics:{raycast:()=>wall?{distance:1}:null},
 net:{handlers,on(){},off(){},broadcast(k,d){events.push([k,d]);if(k==='it')ItemManager.prototype.onEvent.call({items,game:{onItemDropped(it,id,removed){events.push(['nativeHeldRelease',it.id,id,removed])},inventory:{onItemEvent(e){events.push(['nativeInventory',e])}}}},d)},request(){},sendTo(){}},broadcastRun(){events.push(['run'])},
 items:{get:id=>items.get(id),hostSpawn(type,pos,options){if(failSpawn)return null;const id='i'+(++serial);items.set(id,{id,type,pos,holder:null,state:'world',dispose(){events.push(['nativeDispose',id])},...options});return id}},creatures:{noise(){}},ui:{toast(){}},sfx(){}};
 const api=installExpedition13(g);listeners.get('registerHandlers')((k,f)=>handlers.set(k,f),g);listeners.get('mapLoaded')(world,g);
 const send=(op,id='host',token=api.state()?.token)=>handlers.get('e13req')({op,token},id);
 const step=(n=1)=>{for(let i=0;i<n;i++)listeners.get('update')(.25,g)};
 function at(){p.pos.copy(api.plan().anchor).y-=1.3;peer.pos.copy(p.pos)}at();
 return {g,api,p,peer,items,events,listeners,send,step,at,setWall:v=>wall=v,setFail:v=>failSpawn=v};
}
const f=fixture();assert.equal(f.api.plan().kind,'repair');
const geom=f.g.world.outdoor.group.getObjectByName('expedition13-job');assert.ok(geom);assert.ok(geom.children.length<=5);let trayMarker=false;geom.traverse(o=>{const a=o.geometry?.attributes?.position;if(!a)return;for(let i=0;i<a.count;i++)if(Math.abs(a.getX(i)-(f.api.plan().fusePos.x+.8))<.15&&Math.abs(a.getZ(i)-f.api.plan().fusePos.z)<.15&&a.getY(i)>f.api.plan().fusePos.y+.9)trayMarker=true});assert.ok(trayMarker,'amber recovery marker exists at physical supply tray, aside from pickup');
f.setWall(true);f.send('accept');assert.equal(f.api.state().accepted,false);f.setWall(false);
f.setFail(true);f.send('accept');assert.equal(f.api.state().accepted,false);f.setFail(false);
f.send('accept','peer');f.send('accept');assert.equal(f.items.size,1);const s=f.api.state(),fuse=f.items.get(s.fuseId);
f.send('install');assert.equal(s.installed,undefined);fuse.holder='peer';fuse.state='held';f.send('install');assert.equal(s.installed,undefined);
fuse.holder='host';fuse.setHeld=function(id){this.holder=id;this.state='held'};
ItemManager.prototype.onEvent.call({items:f.items,game:{onItemHeld(){}}},{e:'held',id:s.fuseId,h:'peer',iv:{k:'bag',x:0,y:0}});assert.equal(fuse.holder,'peer');assert.equal(fuse.inv.k,'bag');fuse.state='world';f.send('install','peer');assert.equal(s.installed,undefined);fuse.state='held';
f.setWall(true);f.send('install','peer');assert.equal(s.installed,undefined);f.setWall(false);
f.send('install','peer','old');assert.equal(s.installed,undefined);f.send('install','peer');assert.equal(s.installed,true);assert.equal(f.items.size,0);assert.equal(f.events.filter(e=>e[0]==='nativeHeldRelease').length,1);assert.equal(f.events.filter(e=>e[0]==='nativeInventory').length,1);f.send('install','peer');assert.equal(f.items.size,0);
f.g.run.industry13={robot:{}};f.send('robot');assert.equal(f.g.run.credits,100);f.g.run.industry13.robot=null;f.send('robot');f.send('robot');assert.equal(f.g.run.credits,65);
f.p.pos.x+=100;f.peer.pos.x+=100;f.step(20);assert.equal(s.progress,3.75);assert.equal(s.done,false);assert.equal(f.items.size,0);f.at();f.setWall(true);f.step(20);assert.equal(s.progress,7.5);f.setWall(false);f.g.creatures.host=new Map([['threat',{pos:f.api.plan().anchor.clone(),dead:false}]]);f.step(4);assert.equal(s.progress,7.5);f.g.creatures.host.clear();f.g.creatures.host.set('underground',{pos:f.api.plan().anchor.clone().add(new THREE.Vector3(0,-100,0)),dead:false});f.step(1);assert.equal(s.progress,7.6875);f.g.creatures.host.clear();
f.g.run.phase='orbit';f.step(20);assert.equal(s.progress,7.6875);f.g.run.phase='moon';f.step(87);assert.equal(s.done,true);
f.setFail(true);f.send('parcel');assert.equal(s.parcel,false);f.setFail(false);f.send('parcel','peer');f.send('parcel');assert.equal(f.items.size,1);assert.equal(f.items.get(s.rewardId).value,85);assert.equal(f.g.run.credits,65);
f.listeners.get('mapLoaded')(f.g.world,f.g);assert.equal(f.api.state().parcel,true);f.send('parcel');assert.equal(f.items.size,1);
const beforeItems=f.items.size;f.listeners.get('phase')('orbit',f.g);assert.equal(f.g.run.expedition13,null);assert.equal(f.items.size,beforeItems);f.api.dispose();
const u=fixture(3);assert.equal(u.api.plan().kind,'uplink');u.send('accept');u.p.noise=.7;u.step(10);assert.equal(u.api.state().progress||0,0);u.p.noise=0;u.peer.voice=.5;u.step(10);assert.equal(u.api.state().progress||0,0);u.peer.voice=0;u.g.creatures.noise(u.api.plan().anchor,.8);u.step(4);assert.equal(u.api.state().progress||0,0);u.g.time=2;u.step(20);assert.equal(u.api.state().progress,5);u.p.pos.x+=100;u.peer.pos.x+=100;u.step(10);assert.equal(u.api.state().progress,5);u.at();u.step(52);assert.equal(u.api.state().done,true);u.send('robot');assert.equal(u.g.run.credits,100);u.send('parcel');u.send('parcel');assert.equal(u.items.size,1);assert.equal([...u.items.values()][0].value,75);u.api.dispose();
const client=fixture(2,false);assert.equal(client.g.run.expedition13,undefined);client.g.run.expedition13=createFieldJob('hamsi:2:1','repair');client.send('accept');assert.equal(client.api.state().accepted,false);client.step(100);assert.equal(client.api.state().done,false);client.api.dispose();
const x=createFieldJob('x','repair');x.accepted=true;x.installed=true;tickField17(x,100,true,true);assert.equal(x.progress,.25);tickField17(x,NaN,true,true);assert.equal(x.progress,.25);for(let i=0;i<95;i++)tickField17(x,.25,true,true);assert.equal(x.progress,24);assert.equal(x.done,true);
const y=fixture(2);y.g.run.expedition13=createFieldJob('hamsi:2:1','signal');y.listeners.get('mapLoaded')(y.g.world,y.g);assert.equal(y.api.plan().kind,'signal');y.api.dispose();
const z=fixture(3);z.g.run.quotaIndex=0;z.g.run.expedition13=null;z.listeners.get('mapLoaded')(z.g.world,z.g);assert.equal(z.api.plan(),null);z.api.dispose();
const {buildMoonOutdoor}=await import('../../src/world/terrain.js');const {MOONS}=await import('../../src/game/moons.js');
const nativeOutdoor=buildMoonOutdoor(1235,MOONS.hamsi,{physics:{addStaticTrimesh(){return{}},addStaticBox(){return{}},removeCollider(){}},lightPool:{add(x){return x},remove(){}}});
const nativeWorld={terrain:nativeOutdoor.terrain,outdoor:nativeOutdoor},nativeUplink=planField17(nativeWorld,'uplink');assert.ok(nativeUplink);assert.equal(nativeUplink.nodes.length,1);assert.ok(Math.hypot(nativeUplink.anchor.x,nativeUplink.anchor.z)>=14);assert.equal(nativeOutdoor.solidAt(nativeUplink.anchor.x,nativeUplink.anchor.z,.7,nativeUplink.anchor.y-1.3),false);assert.deepEqual(planField17(nativeWorld,'uplink').anchor.toArray(),nativeUplink.anchor.toArray());
const nativeRepair=planField17(nativeWorld,'repair');assert.ok(nativeRepair);assert.ok(nativeRepair.anchor.distanceTo(nativeRepair.fusePos)>=7);
const unsafe={terrain:{...nativeOutdoor.terrain,pathPts:nativeOutdoor.terrain.pathPts,heightAt:()=>0,blocked:()=>true},outdoor:{group:new THREE.Group(),solidAt:()=>false}};assert.equal(planField17(unsafe,'uplink'),null);unsafe.terrain.blocked=()=>false;unsafe.outdoor.solidAt=()=>true;assert.equal(planField17(unsafe,'repair'),null);unsafe.outdoor.solidAt=()=>false;unsafe.terrain.hook={};assert.equal(planField17(unsafe,'uplink'),null);unsafe.terrain.hook=null;unsafe.terrain.lava={};assert.equal(planField17(unsafe,'repair'),null);unsafe.terrain.lava=null;unsafe.terrain.pathPts=Array.from({length:25},()=>({x:1,z:1}));assert.equal(planField17(unsafe,'uplink'),null);assert.equal(planField17(unsafe,'repair'),null);
realWarn('expedition17: PASS (custody, retries, peer authority, quiet presence, finite rewards, compatibility)');
