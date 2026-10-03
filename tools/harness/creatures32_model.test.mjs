import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCreature32} from '../../src/models/creatures32.js';
import {creature32Cue,ensureCreature32Audio} from '../../src/game/creatures32_audio.js';
import {AudioManager} from '../../src/audio/audio.js';
import {Emitter,errLog} from '../../src/core/events.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {createCreatureModel} from '../../src/models/creatures.js';
import {CREATURES} from '../../src/game/creatures.js';
import {ensureTell,dress,apply} from '../../src/game/creature_read.js';
import {installCreatures32} from '../../src/game/creatures32.js';
import {installCreature32Presentation} from '../../src/game/creatures32_presentation.js';
import {installWarmSet} from '../../src/game/warmset.js';

// These checks catch over-budget/invalid meshes, resource sharing across views,
// double disposal, animation replacing resources, and uncached/unbounded cues.
for(const [id,height,radius] of [['c32_dormant',1.65,.4],['c32_ram',1.9,.5]]){
 const m=createCreature32(id),other=createCreature32(id),geos=new Set(),mats=new Set();
 let draws=0,triangles=0,freedGeo=0,freedMat=0;
 m.root.traverse(o=>{
  assert(!o.isLight,'authored workers add no lights');
  if(!o.isMesh)return;
  draws+=Math.max(1,o.geometry.groups.length);geos.add(o.geometry);mats.add(o.material);
  triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  assert.equal(o.material.type,'MeshLambertMaterial');assert(o.material.flatShading);
  assert.equal(o.material.map,null,'procedural worker has no hidden texture ownership');
  const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++)assert(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));
 });
 assert(draws<=20&&triangles<=1400&&mats.size<=4,'native measured art limits');
 assert.equal(m.height,height);assert.equal(m.radius,radius);
 for(const state of ['idle','wake','windup','rest']){
  m.update(0,{state,t:1,time:0,speed:0});
  const bounds=new THREE.Box3().setFromObject(m.root);
  assert(bounds.min.y>=-.005,'native feet-origin warning pose keeps boots above the floor');
 }
 for(const g of geos)g.addEventListener('dispose',()=>freedGeo++);
 for(const mat of mats)mat.addEventListener('dispose',()=>freedMat++);
 other.root.traverse(o=>{if(o.isMesh){assert(!geos.has(o.geometry));assert(!mats.has(o.material));}});
 const yaw=.73;m.root.rotation.y=yaw;
 for(const state of ['idle','wake','chase','windup','charge','rest','stunned','dead']){
  for(const t of [0,.2,.8,1.5,4])m.update(1/60,{state,speed:state==='charge'?6.5:0,t,time:20+t,progress:0,aim:null});
  m.root.updateMatrixWorld(true);
  m.root.traverse(o=>{
   assert(o.matrixWorld.elements.every(Number.isFinite));
   if(o.isMesh){assert(geos.has(o.geometry),'animation keeps geometry');assert(mats.has(o.material),'animation keeps material');}
  });
  assert.equal(m.root.rotation.y,yaw,'animation preserves host-directed yaw');
 }
 m.setTint('#aaa090');m.setElite(false);m.setHitFlash(1);m.setHitFlash(0);
 for(const mat of mats)assert.equal(mat.emissive.getHex(),0,'hit flash returns matte surface');
 m.dispose();m.dispose();assert.equal(freedGeo,geos.size);assert.equal(freedMat,mats.size);
 other.update(.016,{state:'windup',speed:0,t:1,time:1});other.dispose();
 console.log(`${id}: ${draws} draws / ${mats.size} materials / ${triangles} triangles; owned once-dispose`);
}

const ids=['c32_dormant_wake','c32_ram_brake','c32_ram_impact'];
for(const id of ids)for(const sr of [16000,48000]){
 const a=creature32Cue(id,sr);assert(a instanceof Float32Array);
 assert(a.length>sr*.1&&a.length<=sr*2,'short mono cue bounded at native sample rates');
 assert(a.every(Number.isFinite));let peak=0,energy=0;
 for(const v of a){peak=Math.max(peak,Math.abs(v));energy+=v*v;}
 assert(peak<.4&&energy>.01,'finite audible original cue with bounded headroom');
 assert(Math.abs(a[0])<.001&&Math.abs(a.at(-1))<.003,'fades prevent hard boundary clicks');
 assert.deepEqual(a,creature32Cue(id,sr),'same procedural cue is reproducible');
}
assert.equal(ensureCreature32Audio({}),false,'pre-context registration waits for audio');
const allocations=[];
const param=()=>({value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}});
const node=()=>({connect(){return this;},disconnect(){}});
// WebAudio is unavailable in Node; only its platform graph is stubbed. Real
// provider cache and AudioManager.play(volume:0) behavior are exercised below.
const audio=new AudioManager({volume:0});
audio.ctx={sampleRate:16000,currentTime:0,
 createBuffer(ch,len,sr){const samples=new Float32Array(len);const b={numberOfChannels:ch,length:len,sampleRate:sr,copyToChannel(a,c){assert.equal(c,0);samples.set(a);},getChannelData(){return samples;}};allocations.push(b);return b;},
 createBufferSource:()=>({...node(),playbackRate:param(),start(){},stop(){}}),
 createGain:()=>({...node(),gain:param()})};
audio.buses={ui:node(),sfx:node()};
assert(ensureCreature32Audio({audio}));assert(ensureCreature32Audio({audio}));
assert.equal(allocations.length,3,'three one-shot buffers cached once per manager');
assert.equal(audio.handles.size,0,'registration starts no source or persistent loop');
for(const id of ids){const b=audio.buffers.get(id);assert.equal(b.numberOfChannels,1);assert(b.length<=b.sampleRate*2);const h=audio.play(id,{volume:0,raw:true});assert.equal(h.gain.gain.value,0,'explicit silent volume stays zero in native playback');h.stop();h.stop();}
assert.equal(audio.handles.size,0,'native once-shot handles stop cleanly');
console.log('creatures32: bounded original mono cues, native cache and silent-volume playback pass');

// Real registry + emitter + WarmSet cleanup: catches a support-model fallback,
// generic tell/pose double layering, per-landing warm allocation, premature shared
// geometry disposal, retained module listeners and final twice-dispose leaks.
{
 const scene=new THREE.Scene(),mods=new Emitter();mods.creatureModels=new Map();
 const game={scene,engine:{scene},mods,config:{creatures32:true},run:{quotaIndex:2},
  world:{facility:{}},audio:{ctx:null,buffers:new Map()},camera:{position:new THREE.Vector3()}};
 game.creatures=new CreatureManager(game);
 const handlers=()=>[...mods._h.values()].reduce((n,set)=>n+set.size,0);
 const errorsBefore=errLog.total;
 const native=installCreatures32(game);native.dispose();assert.equal(handlers(),0,'native setup leaves no listener behind');
 const warm=installWarmSet(game),presentation=installCreature32Presentation(game);
 assert.equal(handlers(),3,'one WarmSet listener, one warm hook and one deferred-audio hook');
 const fallbackResources=[];
 for(const id of ['c32_dormant','c32_ram']){
  const m=createCreatureModel(CREATURES[id].model,{elite:false,seed:1});
  assert.equal(m.root.name,`creature_${id}`,'native model factory selects the original worker');
  let meshCount=0;const materials=new Set();m.root.traverse(o=>{if(o.isMesh){meshCount++;materials.add(o.material);}});
  assert.equal(ensureTell(m,id,CREATURES[id]),'exempt','generic reader adds no glowing tell');
  const view={model:m,root:m.root,pos:new THREE.Vector3(),type:id,def:CREATURES[id],mgr:{game},height:m.height,state:'windup',stateT:1,hitFlash:0};
  dress(view);m.root.rotation.set(.11,.73,.09);m.root.position.y=.25;
  apply(view,1/60);
  assert.equal(m.root.rotation.x,.11);assert.equal(m.root.rotation.y,.73);assert.equal(m.root.rotation.z,.09);assert.equal(m.root.position.y,.25,'generic pose does not layer over authored warning');
  let afterCount=0;m.root.traverse(o=>{if(o.isMesh){afterCount++;assert(materials.has(o.material));}});
  assert.equal(afterCount,meshCount);assert.equal(materials.size,4);
  fallbackResources.push(m);
 }
 for(const m of fallbackResources)m.dispose();
 const roots=[],geometries=new Set(),materials=new Set();
 mods.emit('warm',warm.hold,game);
 const firstGroup=scene.getObjectByName('warmset');assert(firstGroup);
 roots.push(...firstGroup.children);assert.equal(roots.length,2,'one cached root per worker');
 for(const root of roots)root.traverse(o=>{
  if(!o.isMesh)return;
  assert(o.geometry.userData.shared,'WarmSet cleanup must leave presentation-owned geometry alive');
  geometries.add(o.geometry);materials.add(o.material);
 });
 // Materials have multiple meshes; count disposal by unique owned resource.
 const geometryCounts=new Map(),materialCounts=new Map();
 for(const g of geometries)g.addEventListener('dispose',()=>geometryCounts.set(g,(geometryCounts.get(g)||0)+1));
 for(const m of materials)m.addEventListener('dispose',()=>materialCounts.set(m,(materialCounts.get(m)||0)+1));
 warm.cleanup();warm.cleanup();assert.equal(geometryCounts.size,0);assert.equal(materialCounts.size,0);
 assert(!scene.getObjectByName('warmset'),'warm cleanup removes hidden compile group');
 mods.emit('warm',warm.hold,game);
 const secondGroup=scene.getObjectByName('warmset');assert(secondGroup);
 assert.deepEqual(secondGroup.children,roots,'second landing reuses the same two roots');
 for(const root of secondGroup.children)root.traverse(o=>{if(o.isMesh){assert(geometries.has(o.geometry));assert(materials.has(o.material));}});
 warm.cleanup();assert.equal(geometryCounts.size,0);assert.equal(materialCounts.size,0);
 // Deferred audio retry owns one listener and removes it once ctx exists.
 game.audio=audio;mods.emit('update',1/60,game);mods.emit('update',1/60,game);
 assert.equal(handlers(),2,'successful audio retry removes its one update listener');
 presentation.dispose();presentation.dispose();
 assert.equal(geometryCounts.size,geometries.size);assert.equal(materialCounts.size,materials.size);
 for(const count of geometryCounts.values())assert.equal(count,1,'warm geometry releases exactly once');
 for(const count of materialCounts.values())assert.equal(count,1,'warm material releases exactly once');
 assert.equal(handlers(),1,'presentation removes warm/audio listeners');
 mods.emit('warm',warm.hold,game);assert(!scene.getObjectByName('warmset'),'disposed presentation creates no new warm root');
 warm.dispose();warm.dispose();assert.equal(handlers(),0,'all presentation/warm listeners return to baseline');
 assert.equal(errLog.total,errorsBefore,'real emitter reported no swallowed handler error');
 // Shutdown before AudioContext appears must remove the deferred retry as well.
 game.audio={ctx:null,buffers:new Map()};const pending=installCreature32Presentation(game);
 assert.equal(handlers(),2);pending.dispose();pending.dispose();assert.equal(handlers(),0);
 console.log(`creatures32: native model selection, matte reader opt-outs, two-root warm reuse; ${geometries.size} geometries / ${materials.size} materials disposed once, zero retained listeners`);
}
