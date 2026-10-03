// Native actual-map landmark/resource boundary. Initial entry placement is setup.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics,G,RAPIER,groups} from '../../src/physics/physics.js';
import {LightPool} from '../../src/render/lightpool.js';
import {generateLayout,buildFacility,createFacilityBuild30} from '../../src/world/facility.js';
import {buildDescent21} from '../../src/world/descent21.js';
import {buildOpenPlaces36Landmarks} from '../../src/world/interiors/openplaces36_landmarks.js';
import {setLang} from '../../src/core/i18n.js';
import {Emitter} from '../../src/core/events.js';
import {installBackroomsLevels} from '../../src/game/brlevels.js';
await initPhysics();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function physical(fac){return hash({cols:fac.colliders.map(c=>[c.translation(),c.rotation(),c.shape.type,c.shape.halfExtents]),walk:[...fac.nav.walk],locks:[...fac.nav.blockedEdges],doors:fac.doors.map(d=>[d.id,d.kind,d.pos.toArray(),d.locked]),scrap:fac.scrapSpots,big:fac.bigSpots,emitters:fac.emitters.map(e=>[e.pos.toArray(),e.color,e.intensity,e.group])});}
const cases=[['courtyard','factory',35,.8],['concourse','greenhouse',413,1],['reception','backrooms',771,.9]];
// Preserve the published Wave36 oracle. Wave38 intentionally recolors ordinary emitter RGB only;
// the current exact snapshot still covers every collider/nav/lock/door/cargo/light coordinate and intensity.
const wave36Before={courtyard:'32fcd7c49e987985f54330047c4ddad4d873eeaf9f07b35198331f34834bb0f0',concourse:'f9d304025e3fe1b01ca57cb66842052e81293649e31f37647b68a902c406da7e',reception:'e801f15842fbc4cb6ecfa1f535a775ccd3b8c0a5d67b6dd8ecad4dc642a9db44'};
const before={courtyard:'24574f73c3d104d9d373621d6cd7689367b50ceadfe362f4bf06acfe96f2dc63',concourse:'fd3ca1a329f17ef52fbdec11070dd73bbde7581643140fbcf0e475ab363692fa',reception:wave36Before.reception};
// Capture real Canvas drawing calls through the headless DOM adapter; no rendered-pixel claim.
const create=document.createElement.bind(document),draws=new WeakMap();
document.createElement=function(tag){const node=create(tag);if(tag!=='canvas')return node;const original=node.getContext.bind(node),calls=[];draws.set(node,calls);node.getContext=type=>{const ctx=original(type);return new Proxy(ctx,{get(t,key){if(key==='fillText')return(...args)=>{calls.push(args);t.fillText(...args);};return Reflect.get(t,key);},set(t,key,value){return Reflect.set(t,key,value);}});};return node;};
function geometryBody(mesh){return hash([Array.from(mesh.geometry.attributes.position.array),Array.from(mesh.geometry.attributes.normal.array),Array.from(mesh.geometry.attributes.uv.array),Array.from(mesh.geometry.index.array)]);}
function lightCount(scene){let n=0;scene.traverse(o=>{if(o.isLight)n++;});return n;}
try{
 for(const [kind,theme,seed,size]of cases){
  setLang('en');const scene=new THREE.Scene(),physics=new Physics(),pool=new LightPool(scene),initialLights=lightCount(scene),started=performance.now();
  const L=generateLayout(seed,theme,size,{open35:{version:35,kind}}),fac=buildFacility(L,{physics,lightPool:pool});scene.add(fac.group);physics.world.step();
  const root=fac.group.getObjectByName('openplaces36-landmarks');assert(root?.isGroup,'the actual admitted courtyard must identify its real entrance and four bay purposes');
  const dressing=fac.group.getObjectByName('openplaces40-dressing');
  assert(dressing?.isGroup,'wide bays must contain abandoned wall-mounted work scenes rather than signs alone');
  assert(dressing.userData.panels.length>=4,'each existing service bay has an encountered work scene');
  const dressingMeshes=[];dressing.traverse(o=>{if(o.isMesh)dressingMeshes.push(o);});
  assert(dressingMeshes.length<=3,'bounded wall scenes must not create an unbounded mesh per prop');
  for(const mesh40 of dressingMeshes){
   assert.equal(mesh40.material.emissive.getHex(),0,'abandoned equipment cannot add disco emission');
   assert.equal(mesh40.material.userData.brBake,true,'map materials cannot enter the global Backrooms bake cache');
   const positions40=mesh40.geometry.attributes.position;
   for(let n40=0;n40<positions40.count;n40++){
    const p40={x:positions40.getX(n40),y:positions40.getY(n40),z:positions40.getZ(n40)};
    const panel40=dressing.userData.panels.find(s=>Math.abs((p40.x-s.x)*s.nx+(p40.z-s.z)*s.nz)<.145&&Math.abs((p40.x-s.x)*s.nz-(p40.z-s.z)*s.nx)<1.6);
    assert(panel40,'every actual scene vertex stays in its bounded wall-mounted footprint');
    const wall40=physics.raycast(p40,{x:-panel40.nx,y:0,z:-panel40.nz},.2,G.STATIC);
    assert(wall40&&wall40.distance<.002,'dressing stays inside existing native solid walls, never ghost furniture in haul lanes');
   }
  }
  const dressingDisposed={geometry:0,material:0};for(const mesh40 of dressingMeshes){mesh40.geometry.addEventListener('dispose',()=>dressingDisposed.geometry++);mesh40.material.addEventListener('dispose',()=>dressingDisposed.material++);}
  assert.equal(physical(fac),before[kind],'native collision/nav/doors/cargo/emitter snapshot remains exact after the explicit Wave38 ordinary lamp palette change');
  if(kind!=='reception')assert(fac.emitters.filter(e=>e.group==='facility').every(e=>e.color===0xe6ded0&&!e.flicker),'only ordinary lamps receive the steady industrial palette');
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});assert(meshes.length>=1&&meshes.length<=2,'five landmarks share at most two actual draw meshes');
  const mesh=meshes[0],ownedMat=mesh.material,atlas=mesh.material.map,calls=draws.get(atlas.image),signs=root.userData.signs,geoHash=geometryBody(mesh);
  assert.equal(signs.length,5);assert.deepEqual(signs.filter(s=>s.role==='bay').map(s=>s.room),L.open35.bayRooms);assert.equal(new Set(signs.map(s=>s.title.en)).size,5,'four purposes are distinct physical destinations');
  assert.equal(mesh.material.emissive.getHex(),0);assert.equal(mesh.material.transparent,false);assert(atlas.image.width<=512&&atlas.image.height<=512);assert.equal(atlas.generateMipmaps,false);
  assert.equal(lightCount(scene),initialLights,'native fixed LightPool light count unchanged');
  scene.updateMatrixWorld(true);
  for(const s of signs){
   assert(s.y-s.height/2>=L.y+3.1,'headers stay above a three-metre cargo/body corridor');
   const eye=new THREE.Vector3(s.x+s.nx*6,L.y+1.62,s.z+s.nz*6),target=new THREE.Vector3(s.x,s.y,s.z),delta=target.clone().sub(eye),distance=delta.length();
   const hits=new THREE.Raycaster(eye,delta.normalize(),0,distance+.2).intersectObject(fac.group,true);assert(hits[0]?.object===mesh,`actual public approach view reaches its header before existing roof/wall geometry ${JSON.stringify({kind,sign:s.id,eye:eye.toArray(),target:target.toArray(),hits:hits.slice(0,4).map(h=>({name:h.object.name,level:h.object.userData.levelKey,p:h.point.toArray(),distance:h.distance}))})}`);
   assert.equal(physics.raycast(eye,delta,distance-.15,G.STATIC|G.DOOR),null,'actual standing approach has native LOS to the sign');
   if(s.role==='entrance'){
    assert.equal(s.doorId,fac.mainDoor.id);assert(Math.hypot(s.x-fac.mainDoor.pos.x,s.z-fac.mainDoor.pos.z)<.1,'return marker is anchored to the actual primary native exit');
   }else{
    const r=L.rooms[s.room],front=L.idx(Math.floor((s.x+s.nx*.1-L.ox)/L.cell),Math.floor((s.z+s.nz*.1-L.oz)/L.cell));assert(L.open35.publicRooms.includes(L.roomOf[front]),'bay sign faces its actual public frontage');
    const cargo=new RAPIER.Cuboid(1.5,1.5,1.5),a={x:s.x+s.nx*4,y:L.y+1.6,z:s.z+s.nz*4},velocity={x:-s.nx*8,y:0,z:-s.nz*8};
    assert.equal(physics.world.castShape(a,{x:0,y:0,z:0,w:1},velocity,cargo,.01,1,true,undefined,groups(0xffff,G.STATIC|G.DOOR)),null,'three-metre cargo envelope crosses the actual bay mouth');
    assert(r.w*L.cell>=s.width||r.h*L.cell>=s.width);
   }
  }
  const english=calls.slice(-10).map(c=>c[0]);assert.equal(english.length,10);setLang('tr');const turkish=calls.slice(-10).map(c=>c[0]);assert.notDeepEqual(turkish,english);setLang('ru');const russian=calls.slice(-10).map(c=>c[0]);assert.notDeepEqual(russian,turkish);assert(russian.every(s=>/[А-ЯЁ]/.test(s)),'actual atlas draw writes finite Cyrillic labels');assert.equal(geometryBody(mesh),geoHash,'local language changes cannot alter shared physical placement');
  assert.equal(buildOpenPlaces36Landmarks({layout:L,group:fac.group,doors:fac.doors}),root);assert.equal(root.children.length,1,'same live map call cannot allocate another atlas/draw');
  const lift=buildDescent21({facility:fac,physics});assert(lift?.plan.routeProof.version===23&&lift.plan.entryPath.length>1,'unchanged native certified lift route still builds');physics.world.step();
  for(const spawn of lift.plan.safeSpawns){let collision=false;physics.world.intersectionsWithShape({x:spawn.x,y:spawn.y+.94,z:spawn.z},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.56,.34),()=>{collision=true;return false;},undefined,groups(0xffff,G.STATIC));assert.equal(collision,false);}
  lift.dispose();const disposals={geometry:0,material:0,texture:0};mesh.geometry.addEventListener('dispose',()=>disposals.geometry++);mesh.material.addEventListener('dispose',()=>disposals.material++);atlas.addEventListener('dispose',()=>disposals.texture++);
  if(kind==='reception'){
   const mods=new Emitter(),game={world:{facility:fac},mods,lights:pool,env:{},run:{seed,daysLeft:3,quotaIndex:0},time:0,player:{indoor:true,dead:false,pos:new THREE.Vector3(signs[1].x+signs[1].nx*6,L.y+.1,signs[1].z+signs[1].nz*6)},engine:{fx:{}},audio:null};
   const br=installBackroomsLevels(game);assert.equal(mesh.material,ownedMat,'actual Backrooms bake retains the map-owned sign material instead of globally caching a replacement');br.dispose();
  }
  fac.dispose(physics);fac.dispose(physics);assert.deepEqual(disposals,{geometry:1,material:1,texture:1});assert.equal(physics.info.size,0);const oldCalls=calls.length;setLang('en');assert.equal(calls.length,oldCalls,'native texture disposal releases the language listener');assert.equal(lightCount(scene),initialLights);
  assert.deepEqual(dressingDisposed,{geometry:dressingMeshes.length,material:dressingMeshes.length},'each actual scene mesh/material is disposed once with its map');
  const again=buildFacility(generateLayout(seed,theme,size,{open35:{version:35,kind}}),{physics,lightPool:pool}),next=again.group.getObjectByName('openplaces36-signs');assert.notEqual(next.geometry,mesh.geometry);assert.notEqual(next.material,mesh.material);assert.notEqual(next.material.map,atlas);assert.equal(geometryBody(next),geoHash,'rebuilt actual map owns independent deterministic signage');again.dispose(physics);assert.equal(physics.info.size,0);physics.dispose();
  const stagedPhysics=new Physics(),staged=createFacilityBuild30(generateLayout(seed,theme,size,{open35:{version:35,kind}}),{physics:stagedPhysics,lightPool:{add:e=>e,remove(){}}});let result;while(!staged.done){const step=staged.advance(0);if(step.done)result=step.value;}assert.equal(geometryBody(result.group.getObjectByName('openplaces36-signs')),geoHash);assert.equal(physical(result),before[kind]);result.dispose(stagedPhysics);stagedPhysics.dispose();
  console.log('native landmarks36',JSON.stringify({kind,signs:signs.length,draws:meshes.length,triangles:mesh.geometry.index.count/3,atlas:[atlas.image.width,atlas.image.height],textureBytes:atlas.image.width*atlas.image.height*4,elapsedMs:+(performance.now()-started).toFixed(2),disposals}));
 }
 const legacyPhysics=new Physics(),legacy=buildFacility(generateLayout(35,'factory',.8),{physics:legacyPhysics,lightPool:{add:e=>e,remove(){}}});assert.equal(legacy.group.getObjectByName('openplaces36-landmarks'),undefined);assert.equal(buildOpenPlaces36Landmarks({layout:{...legacy.layout,open35:{version:35,kind:'unknown'}},group:new THREE.Group(),doors:legacy.doors}),null);legacy.dispose(legacyPhysics);legacyPhysics.dispose();
 console.log('openplaces36_landmarks: PASS actual visibility/door and bay provenance,pre-edit native physical snapshots,3m cargo/lift,EN/TR/RU atlas updates,once-only resources/staged/legacy');
}finally{document.createElement=create;setLang('en');}
