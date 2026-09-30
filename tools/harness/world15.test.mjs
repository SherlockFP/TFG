// Archive Intake regression: real builders/colliders and host accounting, no browser or decorative snapshot.
import assert from 'node:assert/strict';
const canvas=()=>({width:0,height:0,style:{},getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:10}):['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):['getImageData','createImageData'].includes(k)?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true})});
globalThis.window=globalThis;globalThis.document={createElement:canvas,documentElement:{},body:{appendChild(){}},head:{appendChild(){}},addEventListener(){},getElementById:()=>null};globalThis.localStorage={getItem:()=>null};
const THREE=await import('three');
const {buildCompany}=await import('../../src/world/company.js'),{buildHub13}=await import('../../src/world/hub13.js');
const {hostMethods}=await import('../../src/game/host.js');
const {fleetLayout,FLEET13}=await import('../../src/game/fleet13_core.js'),{hullBox}=await import('../../src/game/shipyard_core.js');
const {initPhysics,Physics,G,groups}=await import('../../src/physics/physics.js');
await initPhysics();
const companyRoutes=[[[0,10],[-9.5,10],[-9.5,-12],[0,-12],[0,-33.6]],[[0,14],[-29,14],[-29,-10.2],[-29,-21]],[[0,12],[20,12]]];
const hubRoutes=[[[1.8,23],[1.8,29.8]],[[-2.5,23],[-18,23],[-18,27]],[[3.7,21],[5.2,21],[5.2,11]]];
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function assertRoute(ph,label,points){
 for(let j=1;j<points.length;j++){
  const [ax,az]=points[j-1],[bx,bz]=points[j],length=Math.hypot(bx-ax,bz-az),direction=V((bx-ax)/length,0,(bz-az)/length),side=V(direction.z,0,-direction.x);
  for(const width of [-.65,0,.65])for(const y of [-1.05,-.45,.25]){
   const start=V(ax,y,az).addScaledVector(side,width);
   assert.equal(ph.raycast(start,direction,length,G.STATIC|G.DOOR),null,`${label} corridor blocked at body/trolley offset ${width}, height ${y}`);
  }
 }
}
function walk(ph,label,points){
 const [x,z]=points[0],actor=ph.createKinematicCapsule(V(x,-.385,z),.5,.35,G.PLAYER,G.STATIC),cc=ph.world.createCharacterController(.01);cc.setMaxSlopeClimbAngle(.7);cc.enableAutostep(.2,.3,true);ph.world.step();
 try{
  for(let j=1;j<points.length;j++){
   const [tx,tz]=points[j];for(let i=0;i<600;i++){
    const p=actor.body.translation(),dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);if(d<.06)break;
    const k=Math.min(.12,d)/d;cc.computeColliderMovement(actor.col,{x:dx*k,y:-.012,z:dz*k},undefined,groups(G.PLAYER,G.STATIC));const mv=cc.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+mv.x,y:p.y+mv.y,z:p.z+mv.z});ph.world.step();
   }
   const p=actor.body.translation();assert.ok(Math.hypot(p.x-tx,p.z-tz)<.12,`${label} capsule did not reach ${tx},${tz}`);
  }
 }finally{ph.world.removeCharacterController(cc);ph.removeBody(actor.body);}
}
for(const kind of ['company','hub']){
 const ph=new Physics(),emitted=new Set(),removed=new Set(),lights={add(d){emitted.add(d);return d;},remove(d){removed.add(d);}};
 const map=kind==='company'?buildCompany({physics:ph,lightPool:lights}):buildHub13({physics:ph});ph.world.step();
 for(const vessel of Object.keys(FLEET13)){
  const b=hullBox(fleetLayout(vessel)),col=ph.addStaticBox((b.x0+b.x1)/2,1.25,(b.z0+b.z1)/2,(b.x1-b.x0)/2,1.25,(b.z1-b.z0)/2);ph.world.step();
  for(const route of kind==='company'?companyRoutes:hubRoutes)assertRoute(ph,`${kind}/${vessel}`,route);
  ph.removeCollider(col);
 }
 if(kind==='company'){
  assert.equal(map.counter.visible,false,'inherited shutter must not render over the new intake');assert.ok(map.archiveIntake?.update);
  const zone=map.interactables.find(i=>i.type==='sellzone'),bell=map.interactables.find(i=>i.type==='bell');assert.ok(zone&&bell);
  assert.ok(Math.abs(zone.pos.y-(map.groundY+1.1))<1e-8);assert.equal(zone.pos.z,-35.8);assert.equal(bell.pos.x,2.2);
  walk(ph,'first-sale bell',[[-9.5,-12],[0,-12],[0,-32],[2.2,-32],[2.2,-34.5]]);
  const clerk=map.serviceNPCs.find(n=>n.id==='auditor');assert.ok(clerk);walk(ph,'registration window',[[0,-33],[clerk.pos.x,-33],[clerk.pos.x,-34.5]]);
  const eye=V(clerk.pos.x,.37,-34.5),direction=clerk.pos.clone().sub(eye);assert.equal(ph.raycast(eye,direction.clone().normalize(),direction.length(),G.STATIC),null,'registration prompt must be visible through its physical window');
  const tab=map.archiveIntake.root.children.find(o=>o.isMesh&&o.geometry.type==='PlaneGeometry');assert.ok(tab);const initial=tab.position.clone();map.archiveIntake.update(.1,true);assert.ok(tab.position.distanceTo(initial)>0,'processing receipt should react to an actual pending sale');map.archiveIntake.update(.1,false);assert.ok(Number.isFinite(tab.position.y));
  const onTray={id:'on-tray',state:'world',selling:false,def:{kind:'scrap',name:'Big Bolt'},type:'bolt',value:100,obj:{position:zone.pos.clone().add(V(0,.1,0))}};
  const outside={...onTray,id:'outside',obj:{position:zone.pos.clone().add(V(8,.1,0))}},items=[onTray,outside],events=[];let delayed=null;
  const g={world:{company:map},run:{phase:'company',daysLeft:3,buyRnd:.5,favor:1,credits:0,sold:0},items:{all:()=>items},hostData:{selling:false},net:{broadcast(k,d){events.push([k,d]);if(k==='it'&&d.e==='rm'){const i=items.findIndex(it=>it.id===d.id);if(i>=0)items.splice(i,1);}},sendTo(){}},later(fn){delayed=fn;},broadcastRun(){},hostSave(){},aiPlayers:()=>[{id:'p',pos:V(2.2,-1.25,-34.5)}]};
  hostMethods.hostSell.call(g,'p');assert.equal(g.hostData.selling,true);assert.ok(delayed);delayed();assert.equal(events.filter(([k,d])=>k==='it'&&d.e==='rm').length,1);assert.equal(items[0].id,'outside');assert.ok(g.run.credits>0);assert.equal(g.run.sold,g.run.credits);assert.equal(g.hostData.selling,false);
  const paid=g.run.credits;delayed=null;hostMethods.hostSell.call(g,'p');assert.equal(delayed,null,'empty tray must not schedule another payment');assert.equal(g.run.credits,paid,'completed intake delivery cannot pay twice');
 }
 const port=map.group.children.find(o=>o.name===`port14-${kind}`),geometries=new Set();port.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});let disposed=0;for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposed++);
 map.dispose(ph);assert.equal(ph.info.size,0,'all map collider registrations must be cleared');assert.equal(disposed,geometries.size,'owned intake/port geometry must be released exactly once');assert.equal(removed.size,emitted.size,'pool emitters must be released');ph.world.free();
 console.log(`${kind}: real collision corridors / all four hulls / lifecycle pass`);
}
console.log('world15: first sale, empty-tray repeat prevention, clerk access, receipt processing and real Rapier capsule paths pass');
