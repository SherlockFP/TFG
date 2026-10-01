import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const canvas=()=>({width:0,height:0,style:{},getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:10}):['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):['getImageData','createImageData'].includes(k)?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true})});
globalThis.window=globalThis;globalThis.document={createElement:canvas,documentElement:{},body:{appendChild(){}},head:{appendChild(){}},addEventListener(){},getElementById:()=>null};globalThis.localStorage={getItem:()=>null};globalThis.addEventListener=globalThis.removeEventListener=()=>{};
const THREE=await import('three');
const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
const {initPhysics,Physics,G,groups}=await import('../../src/physics/physics.js');await initPhysics();
const {Game}=await import('../../src/game/game.js');
const {installDarkCollapse20}=await import('../../src/game/darkcollapse20.js');
const {alternateReturn,newDarkRoom,stepDarkRoom}=await import('../../src/game/darkcollapse20_core.js');
let maps=0;
for(const theme of ['threadarchive','bufferfoundry'])for(const seed of [17,42]){
 const ph=new Physics(),F=buildFacility(generateLayout(seed,theme,.9),{physics:ph,lightPool:{add:e=>e,remove(){}}});ph.world.step();
 const hooks=new Map(),sent=[],sounds=[],cargo=[];
 const game={isHost:true,time:0,run:{phase:'moon',moon:'hamsi',seed,day:0,powerOn:false},world:{facility:F},physics:ph,player:{indoor:true,pos:new THREE.Vector3()},mods:{on:(k,fn)=>{hooks.set(k,fn);return()=>hooks.delete(k);}},audio:{play:(...a)=>sounds.push(a),at(){}},ui:{toast(){}},net:{handlers:new Map(['door','unlock','vault'].map(k=>[k,()=>sent.push(k)]))},items:{all:()=>cargo},doorById:id=>F.doors.find(d=>d.id===id),onDoor:Game.prototype.onDoor,broadcastRun(){}};
 const crew={id:'a',dead:false,zone:'in',flash:false,pos:game.player.pos};game.aiPlayers=()=>[crew];
 const api=installDarkCollapse20(game);assert(api.prepare());assert(api.candidates().length>0,`${theme}/${seed}: actual optional cyclic door candidate`);assert(api.candidates().length<=2);
 const c=api.candidates()[0],r=c.room,L=F.layout;crew.pos.set(L.ox+(r.x+r.w/2)*L.cell,L.y+.9,L.oz+(r.z+r.h/2)*L.cell);
 const tick=(seconds)=>{for(let i=0;i<Math.round(seconds*60);i++){game.time+=1/60;hooks.get('update')(1/60,game);Game.prototype.updateDoors.call(game,1/60);ph.world.step();}};
 tick(44);assert.equal(api.state().rooms[0].stage,'safe','long quiet threshold');
 crew.flash=true;tick(2);assert(api.state().rooms[0].dark<41,'native lit flashlight recedes darkness');crew.flash=false;
 tick(7);assert.equal(api.state().rooms[0].stage,'warning','actual six-second warning before any blocker');
 const body={type:'body',state:'world',obj:{position:new THREE.Vector3(c.door.colArgs[0],L.y,c.door.colArgs[2])}};cargo.push(body);
 tick(7);assert.equal(api.state().rooms[0].stage,'warning','world body defers final collapse');assert.notEqual(c.door.locked,true);
 cargo.length=0;tick(.1);assert.equal(api.state().rooms[0].stage,'collapsed');assert.equal(c.door.locked,true);assert(F.nav.blockedEdges.has(c.door.info.key),'native nav excludes collapsed passage');
 tick(1);assert(c.door.collider,'actual native Rapier blocker exists');
 const peerHooks=new Map(),peerDoor=Object.assign({},c.door,{open:true,locked:false}),peerFac=Object.assign({},F,{doors:F.doors.map(d=>d.id===peerDoor.id?peerDoor:Object.assign({},d))});
 const peer=Object.assign({},game,{isHost:false,run:structuredClone(game.run),world:{facility:peerFac},mods:{on:(k,fn)=>{peerHooks.set(k,fn);return()=>{};}},doorById:id=>peerFac.doors.find(d=>d.id===id),broadcastRun:()=>assert.fail('replica cannot publish pressure')});
 const replica=installDarkCollapse20(peer);replica.prepare();peerHooks.get('update')(1/60,peer);
 assert.equal(peerDoor.open,false);assert.equal(peerDoor.locked,true,'replica applies permanent native door state');assert.deepEqual(replica.state(),api.state(),'peer pressure/charge ledger matches host');replica.dispose();
 const a=c.door.colArgs,dir=new THREE.Vector3(a[3]>a[5]?0:1,0,a[3]>a[5]?1:0),origin=new THREE.Vector3(a[0],a[1],a[2]).addScaledVector(dir,-1);
 assert.equal(ph.raycast(origin,dir,2,G.STATIC|G.DOOR)?.info?.door?.id,c.door.id,'real doorway ray is physically blocked');
 assert(alternateReturn(F.nav,c.door,F.mainDoor),'actual subcell graph retains alternate entrance return');
 for(const index of [c.door.info.a,c.door.info.b]){const x=L.ox+(index%L.w+.5)*L.cell,z=L.oz+(Math.floor(index/L.w)+.5)*L.cell;assert(F.nav.findPath(x,z,F.mainDoor.pos.x,F.mainDoor.pos.z),'both sides have native return paths');}
 if(theme==='threadarchive'&&seed===17){
  for(const d of F.doors)if(d.id!==c.door.id&&d.kind==='door'&&!d.locked)game.onDoor({id:d.id,open:true,silent:true});
  for(let k=0;k<90;k++){Game.prototype.updateDoors.call(game,1/60);ph.world.step();}
  const path=F.nav.findPath(crew.pos.x,crew.pos.z,F.mainDoor.pos.x,F.mainDoor.pos.z);
  const actor=ph.createKinematicCapsule(crew.pos.clone(),.5,.35,G.PLAYER,G.STATIC|G.DOOR),controller=ph.world.createCharacterController(.015);controller.enableAutostep(.3,.3,true);controller.setMaxSlopeClimbAngle(.8);ph.world.step();
  for(const point of path){let reached=false;for(let n=0;n<1400;n++){const p=actor.body.translation(),dx=point.x-p.x,dz=point.z-p.z,len=Math.hypot(dx,dz);if(len<.2){reached=true;break;}const step=Math.min(.07,len);controller.computeColliderMovement(actor.col,{x:dx/len*step,y:-.03,z:dz/len*step},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const m=controller.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});ph.world.step();}assert(reached,`actual capsule alternate return waypoint ${point.x}/${point.z}`);}
  ph.world.removeCharacterController(controller);ph.removeBody(actor.body);
 }
 hooks.get('registerHandlers')((k,fn)=>game.net.handlers.set(k,fn),game);game.net.handlers.get('door')({id:c.door.id},'a');game.net.handlers.get('unlock')({id:c.door.id},'a');assert.equal(sent.length,0,'native old-door/key bypass denied');
 const saved=structuredClone(game.run.darkcollapse20);api.dispose();game.run.darkcollapse20=saved;const migrated=installDarkCollapse20(game);assert(migrated.prepare());assert(migrated.candidates().some(v=>v.door.id===c.door.id),'migration preserves already locked candidate');assert.equal(migrated.state().rooms[0].stage,'collapsed');migrated.dispose();
 assert.equal(sounds.filter(([s])=>s==='door_creak').length,1,'one warning sound during continuous dark exposure');
 F.dispose(ph);ph.world.free();maps++;
}
const s=newDarkRoom('bounded');for(let n=0;n<100;n++)stepDarkRoom(s,100,true,false);assert(s.dark<=25.001,'long stalled frame cannot instantly collapse');
console.log(`darkcollapse20: PASS (${maps} native generated maps, timed light/body protection, real collider/nav return, bypass and migration)`);
