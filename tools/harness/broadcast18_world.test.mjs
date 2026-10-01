import assert from 'node:assert/strict';
const canvas=()=>({width:0,height:0,style:{},getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:10}):['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):['getImageData','createImageData'].includes(k)?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true})});
globalThis.window=globalThis;globalThis.document={createElement:canvas,documentElement:{},body:{appendChild(){}},head:{appendChild(){}},addEventListener(){},getElementById:()=>null};globalThis.localStorage={getItem:()=>null};
const THREE=await import('three');
const {buildMoonOutdoor}=await import('../../src/world/terrain.js');
const {MOONS}=await import('../../src/game/moons.js');
const {initPhysics,Physics,G,groups}=await import('../../src/physics/physics.js');await initPhysics();
let made=0;
for(const seed of [17,1235,1234,777,42,387276917,1161830751,3576916120,3337565728,3724842645,591706100]){
 const ph=new Physics(),lights={add:e=>e,remove(){}};
 const out=buildMoonOutdoor(seed,MOONS.hamsi,{physics:ph,lightPool:lights});ph.world.step();
 const ward=out.broadcast18;console.log('broadcast seed',seed,'facades',ward?.plan.buildings.length);
 assert.ok(ward,`seed ${seed}: first moon should receive authored ward`);made++;
 const p=ward.plan;assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.shortcutDoor),'immutable plan');
 assert.ok(p.buildings.length>=3&&p.buildings.length<=5,'distinct facade budget');
 assert.equal(ward.group.children.some(c=>c.isLight),false,'no new renderer lights');
 let meshes=0;ward.group.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<=11,'bounded merged geometry plus one replay status strip');
 // Whole actual seeded outdoor map: every ordinary path segment remains free of this lane's solid geometry.
 const main=p.mainReturn;
 for(let j=3;j<main.length-2;j++)for(const offset of [-.4,0,.4]){
  const a=main[j],b=main[j+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),side=new THREE.Vector3(-dz/len,0,dx/len);
  const start=new THREE.Vector3(a.x,out.terrain.heightAt(a.x,a.z)+1,a.z).addScaledVector(side,offset),end=new THREE.Vector3(b.x,out.terrain.heightAt(b.x,b.z)+1,b.z).addScaledVector(side,offset),dir=end.clone().sub(start),length=dir.length();dir.normalize();
  const hit=ph.raycast(start,dir,length,G.STATIC|G.DOOR);assert.ok(!hit?.info?.id?.startsWith('broadcast18'),`seed${seed}: ward blocks main return`);
 }
 // Check all of the proposed optional route, including both street connectors, against actual ward solids.
 for(let j=1;j<p.serviceRoute.length;j++){
  const a=p.serviceRoute[j-1],b=p.serviceRoute[j],steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z));
  for(let k=0;k<steps;k++){
   const t=k/steps,u=(k+1)/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,xx=a.x+(b.x-a.x)*u,zz=a.z+(b.z-a.z)*u;
   const origin=new THREE.Vector3(x,out.terrain.heightAt(x,z)+.9,z),end=new THREE.Vector3(xx,out.terrain.heightAt(xx,zz)+.9,zz),direction=end.clone().sub(origin),length=direction.length();direction.normalize();
   const hit=ph.raycast(origin,direction,length,G.STATIC|G.DOOR);assert.ok(!hit?.info?.id?.startsWith('broadcast18'),`seed${seed}: open optional route intersects ward solid`);
  }
 }
 const gate=p.shortcutDoor,axis=p.axis,center=new THREE.Vector3(gate.pos.x,out.terrain.heightAt(gate.pos.x,gate.pos.z)+1,gate.pos.z),dir=new THREE.Vector3(axis.tx,0,axis.tz),start=center.clone().addScaledVector(dir,-1.5);
 assert.equal(ward.gateCollider,null,'powered passage starts open');
 ward.setPowered(false);ph.world.step();assert.ok(ward.gateCollider,'cut creates real gate collider');assert.equal(ph.raycast(start,dir,3,G.STATIC|G.DOOR)?.info.id,'broadcast18-gate','closed shortcut really blocks crossing');
 const actor=ph.createKinematicCapsule(new THREE.Vector3(start.x,out.terrain.heightAt(start.x,start.z)+.9,start.z),.5,.35,G.PLAYER,G.STATIC),cc=ph.world.createCharacterController(.015);
 cc.enableAutostep(.3,.3,true);cc.setMaxSlopeClimbAngle(.8);ph.world.step();
 const move=()=>{const p=actor.body.translation();cc.computeColliderMovement(actor.col,{x:dir.x*.075,y:-.03,z:dir.z*.075},undefined,groups(G.PLAYER,G.STATIC));const mv=cc.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+mv.x,y:p.y+mv.y,z:p.z+mv.z});ph.world.step();};
 for(let k=0;k<30;k++)move();let actorPos=actor.body.translation();assert.ok((actorPos.x-start.x)*dir.x+(actorPos.z-start.z)*dir.z<1.4,'closed optional gate blocks actual player capsule');
 assert.equal(ward.canClose(center.clone().add(new THREE.Vector3(0,-1,0))),false,'occupancy guard detects player under gate');assert.equal(ward.canClose(center.clone().addScaledVector(dir,4)),true,'clear player permits closure');
 ward.setPowered(true);ph.world.step();assert.equal(ward.gateCollider,null,'restored signal removes collider');assert.equal(ph.raycast(start,dir,3,G.STATIC|G.DOOR),null,'open shortcut ray clear');
 for(let k=0;k<45;k++)move();actorPos=actor.body.translation();assert.ok((actorPos.x-start.x)*dir.x+(actorPos.z-start.z)*dir.z>3,'open optional passage crosses with actual player capsule');
 ph.world.removeCharacterController(cc);ph.removeBody(actor.body);
 const eye=p.console.clone().add(new THREE.Vector3(-axis.nx*1.8,.3,-axis.nz*1.8));assert.ok(ph.lineOfSight(eye,p.console),'physical console ray reachable');
 assert.ok(p.replayControl,'physical transmitter replay control available');
 const replayEye=p.replayApproach.clone();
 replayEye.y=out.terrain.heightAt(replayEye.x,replayEye.z)+1.6;
 assert.ok(ph.lineOfSight(replayEye,p.replayControl),'physical replay control has a clear approach ray');
 if(seed===17){
  const approach=p.replayApproach,body=ph.createKinematicCapsule(new THREE.Vector3(approach.x,out.terrain.heightAt(approach.x,approach.z)+.9,approach.z),.5,.35,G.PLAYER,G.STATIC),controller=ph.world.createCharacterController(.015);
  controller.enableAutostep(.3,.3,true);controller.setMaxSlopeClimbAngle(.8);ph.world.step();
  const toward=p.replayControl.clone().sub(approach);toward.y=0;toward.normalize();const before=body.body.translation();
  controller.computeColliderMovement(body.col,{x:toward.x*.4,y:-.03,z:toward.z*.4},undefined,groups(G.PLAYER,G.STATIC));
  const movement=controller.computedMovement();assert.ok(movement.x*toward.x+movement.z*toward.z>.3,'actual player capsule can approach replay E control');
  assert.ok(Math.hypot(before.x-p.replayControl.x,before.z-p.replayControl.z)<2.4,'native reachable interaction radius');
  ph.world.removeCharacterController(controller);ph.removeBody(body.body);
 }
 out.dispose(ph);assert.equal(ward.group.parent,null,'owned ward removed');ph.world.free();
}
const ph=new Physics(),out=buildMoonOutdoor(17,MOONS.lufer,{physics:ph,lightPool:{add:e=>e,remove(){}}});assert.equal(out.broadcast18,null,'other moons unchanged');out.dispose(ph);ph.world.free();
console.log(`broadcast18 world: PASS (${made} actual maps + other-moon exclusion)`);
