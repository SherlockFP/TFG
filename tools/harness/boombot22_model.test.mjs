import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBoomBot22} from '../../src/models/boombot22.js';
import {createBallMesh,GRENADE_MODELS} from '../../src/models/grenades.js';
import {BOOMBOT22_SOUNDS} from '../../src/audio/boombot22_sfx.js';
for(const factory of [createBoomBot22,()=>createBallMesh('bouncer')]){
 const model=factory(),geos=new Set(),mats=new Set();let triangles=0,draws=0,geometryFreed=0,materialFreed=0;
 model.traverse(o=>{assert(!o.isLight,'authored warning has no scene lights');if(o.isMesh){draws++;geos.add(o.geometry);mats.add(o.material);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;assert(['MeshLambertMaterial','MeshBasicMaterial'].includes(o.material.type));
 const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){assert(Number.isFinite(a.getX(i)+a.getY(i)+a.getZ(i)));assert(Math.hypot(a.getX(i),a.getZ(i))<=.22+.00001,'all visible parts fit actual round footprint');}}});
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());assert(size.x<=.44&&size.y<=.36&&size.z<=.44);assert(Math.abs(bounds.min.y+.22)<.00001,'rollers touch the native floor when collision center rests at +.22');assert(draws<=5&&triangles<900,'merged industrial geometry stays modest');assert(model.userData.led?.isMesh);assert.equal(model.userData.led.name,'echo-runner22-lamp');model.userData.led.visible=false;
 for(const g of geos)g.addEventListener('dispose',()=>geometryFreed++);for(const m of mats)m.addEventListener('dispose',()=>materialFreed++);
 model.userData.dispose();model.userData.dispose();assert.equal(geometryFreed,geos.size);assert.equal(materialFreed,mats.size);
 console.log(`boombot22 projectile: ${draws} batches / ${triangles} triangles, ${size.toArray().map(v=>v.toFixed(3)).join('x')}m`);
}
const held=GRENADE_MODELS.bouncebot(),next=GRENADE_MODELS.bouncebot(),materials=new Set();let cacheDisposals=0;
held.traverse(o=>{if(o.isMesh)materials.add(o.material);});next.traverse(o=>{if(o.isMesh)assert(materials.has(o.material),'held models use native render-cache materials');});for(const m of materials)m.addEventListener('dispose',()=>cacheDisposals++);held.userData.dispose();next.userData.dispose();assert.equal(cacheDisposals,0,'native held teardown never destroys shared render cache');
for(const [id,gen] of Object.entries(BOOMBOT22_SOUNDS))for(const sr of [16000,48000]){const a=gen(sr);assert(a instanceof Float32Array&&a.length>sr*.1&&a.length<sr);assert(a.every(Number.isFinite));assert(Math.max(...a.map(Math.abs))<.4);assert(Math.abs(a[0])<.001&&Math.abs(a.at(-1))<.003,'cue has fade boundaries');assert.deepEqual(a,gen(sr),'original procedural cues deterministic');if(id==='bb22_warn')assert(a.length/sr<=.2,'warning fits native200ms cadence without layered overlapping beeps');}
console.log('boombot22 held/projectile ownership, round footprint, warning hook and native sound gens pass');
