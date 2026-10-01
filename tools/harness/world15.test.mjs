// Archive Intake regression: real builders/colliders and host accounting, no browser or decorative snapshot.
import assert from 'node:assert/strict';
const canvas=()=>({width:0,height:0,style:{},getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:10}):['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):['getImageData','createImageData'].includes(k)?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true})});
globalThis.window=globalThis;globalThis.document={createElement:canvas,documentElement:{},body:{appendChild(){}},head:{appendChild(){}},addEventListener(){},getElementById:()=>null};globalThis.localStorage={getItem:()=>null};
const THREE=await import('three');
const {buildCompany}=await import('../../src/world/company.js'),{buildHub13,HUB13_BROKER,HUB13_SPAWN}=await import('../../src/world/hub13.js');
const {hostMethods}=await import('../../src/game/host.js');
const {fleetLayout,FLEET13,sanitizeFleet13}=await import('../../src/game/fleet13_core.js'),{hullBox}=await import('../../src/game/shipyard_core.js');
const {installFleet13}=await import('../../src/game/fleet13.js'),{LocalPlayer}=await import('../../src/entities/localplayer.js');
const {register}=await import('node:module');register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {actionMethods}=await import('../../src/game/actions.js');
const {createTrading15}=await import('../../src/game/trading15.js');
const {CITY_ROUTES13}=await import('../../src/game/life13_core.js');
const {initPhysics,Physics,G,groups}=await import('../../src/physics/physics.js');
await initPhysics();
// The fallback must remain selectable too; build before the real asset enters the production cache.
const fallbackPhysics=new Physics(),fallbackHub=buildHub13({physics:fallbackPhysics});assert.equal(fallbackHub.dock18.assetReady,false);
// Preload the actual original GLB through the production loader; only transport is a local file fixture.
const fs=await import('node:fs/promises'),{loadExtManifest}=await import('../../src/audio/extassets.js'),{preloadExtModels,hasExt,extInstance}=await import('../../src/world/extmodels.js');
const realFetch=globalThis.fetch;globalThis.ProgressEvent??=class {constructor(type,data){Object.assign(this,data);this.type=type;}};
const manifest=JSON.parse(await fs.readFile(new URL('../../public/assets/ext/manifest.json',import.meta.url),'utf8'));const original=manifest.models.find(m=>m.id==='tfg_dockmaster18');assert.ok(original);const glb=await fs.readFile(new URL('../../public/assets/original/dockmaster18.glb',import.meta.url));assert.ok(glb.length<350000);
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;if(url.includes('manifest.json'))return new Response(JSON.stringify({...manifest,models:[{...original,path:'https://fixture.tfg/dockmaster18.glb'}]}));if(url.includes('dockmaster18.glb'))return new Response(glb,{headers:{'content-length':String(glb.length)}});throw Error('Unexpected asset transport '+url)};
try{await loadExtManifest();await preloadExtModels(['tfg_dockmaster18']);}finally{globalThis.fetch=realFetch;}assert.equal(hasExt('tfg_dockmaster18'),true);window.__kefalExtTextures=false;
const cached=extInstance('tfg_dockmaster18'),cachedGeo=new Set();cached.traverse(o=>{if(o.geometry)cachedGeo.add(o.geometry)});let cachedDisposed=0;for(const g of cachedGeo)g.addEventListener('dispose',()=>cachedDisposed++);
const glbJson=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());assert.equal(glbJson.materials.length,7);assert.equal(glbJson.meshes.length,16);assert.ok(glbJson.nodes.some(n=>n.name==='dockmaster18_actor'));assert.ok(glbJson.nodes.some(n=>n.name==='dockmaster18_facade'));assert.equal(glbJson.images,undefined);const mintIndex=glbJson.materials.findIndex(m=>m.name==='dock18_mint');const greenMeshes=glbJson.meshes.filter(m=>m.primitives.some(p=>p.material===mintIndex));assert.equal(greenMeshes.length,1);assert.ok(glbJson.nodes.some(n=>n.mesh===glbJson.meshes.indexOf(greenMeshes[0])&&n.name.includes('desk')),'green belongs only to tiny terminal status, never actor/facade');assert.ok(glbJson.materials.some(m=>m.name==='dock18_workwear'));assert.ok(glbJson.meshes.every(m=>m.primitives.every(p=>p.attributes.COLOR_0!==undefined)),'original vertex wear exported');const triangles=glbJson.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+glbJson.accessors[p.indices].count/3,0),0);assert.equal(triangles,3896);cached.traverse(o=>{if(o.isMesh)assert.equal(o.material.vertexColors,true,'production PSX loader preserves original vertex wear')});console.log('dockmaster18 GLB bytes',glb.length);

const companyRoutes=[[[0,10],[-9.5,10],[-9.5,-12],[0,-12],[0,-33.6]],[[0,14],[-29,14],[-29,-10.2],[-29,-21]],[[0,12],[20,12]]];
const hubRoutes=[[[1.8,23],[1.8,29.8]],[[-2.5,23],[-18,23],[-18,27]],[[3.7,21],[5.2,21],[5.2,11]]];
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function assertBroker(ph,map){
 const camera=new THREE.PerspectiveCamera(),events={},handlers={};
 const game={physics:ph,camera,engine:{camera},isHost:true,selfId:'host',profile:{},world:{moonId:'__relay13'},remotes:new Map(),run:{phase:'orbit',credits:60,fleet13:sanitizeFleet13({docked:true})},ui:{toast(){}},net:{},mods:{on(k,fn){events[k]=fn;return ()=>{};}},items:{get:()=>null}};
 game.player=new LocalPlayer(game);const p=game.player,api=installFleet13(game);events.registerHandlers((k,fn)=>handlers[k]=fn,game);
 game.interactablesNow=()=>{const out=[];events.interactables(out,game);return out;};
 const select=()=>actionMethods.findInteraction.call(game),aim=target=>{camera.position.copy(p.eyePos());camera.lookAt(target);camera.updateMatrixWorld();};
 // Initial feet are a labelled arrival fixture. Every subsequent approach step uses the native standing capsule/controller.
 p.teleport(V(...HUB13_SPAWN));ph.world.step();
 try{
  for(const target of [V(1.8,-1.25,23),V(1.8,-1.25,29.8)]){
   for(let i=0;i<600;i++){
    const b=p.body.translation(),dx=target.x-b.x,dz=target.z-b.z,d=Math.hypot(dx,dz);if(d<.06)break;
    const k=Math.min(.10,d)/d;p.ctrl.computeColliderMovement(p.col,{x:dx*k,y:-.012,z:dz*k},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));
    const mv=p.ctrl.computedMovement();p.body.setNextKinematicTranslation({x:b.x+mv.x,y:b.y+mv.y,z:b.z+mv.z});ph.world.step();const q=p.body.translation();p.pos.set(q.x,q.y-p.half-.34,q.z);
   }
   assert.ok(Math.hypot(p.pos.x-target.x,p.pos.z-target.z)<.12,'native standing customer must physically reach the counter');
  }
  const service=map.group.getObjectByName('dockmaster18-service');service.updateMatrixWorld(true);
  const screen=service.getObjectByName(map.dock18.assetReady?'dockmaster18_actor_dock18_screen':'visor');assert.ok(screen,'actual production/fallback screen node');
  const face=new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3()),broker=V(...HUB13_BROKER);
  if(map.dock18.assetReady){assert.ok(face.distanceTo(V(0,.705,31.628))<.001,'actual exported CRT transform');assert.ok(broker.z<face.z&&broker.distanceTo(face)<.1,'point must lie immediately in front of exported CRT');}
  aim(face);assert.equal(ph.lineOfSight(camera.position,broker,G.STATIC|G.DOOR),true,'customer ray clears the real counter');
  assert.equal(select()?.label,'Fleet broker','actual native selector accepts aim at the visible face');
  const nativePoints=game.interactablesNow;game.interactablesNow=()=>[{...nativePoints()[0],pos:V(0,.2,30)}];
  if(map.dock18.assetReady)assert.equal(select(),null,'old empty-aisle anchor reproduces visible-head E miss');game.interactablesNow=nativePoints;
  const saved=p.pos.clone();p.dead=true;assert.equal(select(),null);handlers.f13act({op:'buy',id:'courier'},'host');assert.equal(game.run.fleet13.selected,null);p.dead=false;
  p.downed=true;assert.equal(select(),null);handlers.f13act({op:'buy',id:'courier'},'host');assert.equal(game.run.fleet13.selected,null);p.downed=false;
  handlers.f13act({op:'buy',id:'courier'},'crew');assert.equal(game.run.fleet13.selected,null,'peer cannot purchase');
  p.pos.set(0,-1.25,23);handlers.f13act({op:'buy',id:'courier'},'host');assert.equal(game.run.fleet13.selected,null,'distant host cannot purchase');p.pos.copy(saved);
  aim(face);const mid=camera.position.clone().lerp(broker,.5),wall=ph.addStaticBox(mid.x,mid.y,mid.z,.5,.8,.5);ph.world.step();
  assert.equal(select(),null,'real intervening wall rejects E without noLos');ph.removeCollider(wall);ph.world.step();assert.equal(select()?.label,'Fleet broker');
  handlers.f13act({op:'buy',id:'courier'},'host');assert.equal(game.run.fleet13.selected,'courier');assert.equal(game.run.credits,60,'physical host can claim the free ship without currency changes');
  console.log('dock28 broker',JSON.stringify({variant:map.dock18.assetReady?'production-GLB':'fallback',feet:p.pos.toArray(),face:face.toArray(),point:broker.toArray(),eye:p.eyePos().toArray(),nativeE:true,LOS:true,wallRejected:true,hostAuthority:true}));
 }finally{api.dispose();ph.world.removeCharacterController(p.ctrl);ph.removeBody(p.body);}
}
fallbackPhysics.world.step();assertBroker(fallbackPhysics,fallbackHub);fallbackHub.dispose(fallbackPhysics);assert.equal(fallbackPhysics.info.size,0);fallbackPhysics.world.free();
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
  if(kind==='hub'){ph.world.step();for(const r of map.dock18.routes)assertRoute(ph,`dock18/${vessel}/${r.id}`,r.feet.map(p=>[p[0],p[2]]));
   for(let x=b.x0+.5;x<b.x1;x+=1.5)for(let z=b.z0+.5;z<b.z1;z+=1.5)assert.equal(ph.raycast(V(x,.05,z),V(0,1,0),vessel==='survey'?9:4,G.STATIC),null,`${vessel} transfer structure intrudes on native vessel envelope`);
  }
 }
 if(kind==='hub'){
  assertBroker(ph,map);
  assert.equal(map.dock18.assetReady,true);const service=map.group.getObjectByName('dockmaster18-service');assert.ok(service);service.traverse(o=>{if(o.geometry)assert.equal(cachedGeo.has(o.geometry),false,'map clone must own geometry independently of preload cache')});
  const vendor=new THREE.Group();vendor.position.set(-18,-1.25,29);map.group.add(vendor);const trading=createTrading15({physics:ph,items:{all:()=>[]}},()=>true);trading.bind(vendor);ph.world.step();
  for(const r of map.dock18.routes)walk(ph,`dock18/${r.id}`,r.feet.map(p=>[p[0],p[2]]));
  for(const [i,loop]of CITY_ROUTES13.hub.entries()){const route=[...loop,loop[0]];assertRoute(ph,`dock18 citizen${i}`,route);walk(ph,`dock18 citizen${i}`,route);}
  trading.dispose();vendor.removeFromParent();const dock=map.group.getObjectByName('dock18-transfer-port');assert.ok(dock);assert.equal(dock.children.length,2);let lights=0,verts=0,triangles=0;map.group.traverse(o=>{if(o.isLight)lights++});dock.traverse(o=>{if(o.geometry){verts+=o.geometry.attributes.position.count;triangles+=o.geometry.index.count/3;}});assert.equal(lights,0);assert.ok(Object.isFrozen(map.dock18.routes));console.log('dock18 metrics',JSON.stringify({...map.dock18,colliders:map.colliders.length,vertices:verts,triangles}));
 }
 if(kind==='company'){
  assert.equal(map.counter.visible,false,'inherited shutter must not render over the new intake');assert.ok(map.archiveIntake?.update);
  assert.equal(map.exchange18.metrics.lights,0);assert.ok(map.exchange18.metrics.batches<=8,'exchange static batches remain bounded');
  for(const view of map.exchange18.viewpoints){assertRoute(ph,`exchange/${view.name}`,view.route);walk(ph,`exchange/${view.name}`,view.route);}
  for(const route of [[[-12,14],[-4,14],[-4,22],[-12,22],[-12,14]],[[4,18],[12,18],[12,24],[4,24],[4,18]]])assertRoute(ph,'courier citizen loop',route);
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
 const port=map.group.children.find(o=>o.name===`port14-${kind}`),geometries=new Set();port.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});map.exchange18?.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});let disposed=0;for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposed++);
 map.dispose(ph);assert.equal(ph.info.size,0,'all map collider registrations must be cleared');assert.equal(disposed,geometries.size,'owned intake/port geometry must be released exactly once');assert.equal(removed.size,emitted.size,'pool emitters must be released');assert.equal(cachedDisposed,0,'hub disposal cannot release preloaded GLB template');ph.world.free();
 if(map.exchange18)console.log('exchange18 metrics',JSON.stringify(map.exchange18.metrics),`colliders=${map.colliders.length} emitters=${emitted.size}`);
 console.log(`${kind}: real collision corridors / all four hulls / lifecycle pass`);
}
console.log('world15: first sale, empty-tray repeat prevention, clerk access, receipt processing and real Rapier capsule paths pass');
