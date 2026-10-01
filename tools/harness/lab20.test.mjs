// Native seeded layouts, optional-cycle safety and real capsule traversal, not decorative snapshots.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {NavGrid} from '../../src/world/nav.js';
import {initPhysics,Physics,G,groups,RAPIER} from '../../src/physics/physics.js';
await initPhysics();
const warnings=[],warn=console.warn;console.warn=(...a)=>warnings.push(a.join(' '));
function walk(ph,L,path,label){
 const p=path[0],actor=ph.createKinematicCapsule(new THREE.Vector3(p.x,L.y+.865,p.z),.5,.35,G.PLAYER,G.STATIC),cc=ph.world.createCharacterController(.01);cc.enableAutostep(.2,.3,true);ph.world.step();
 try{for(const target of path.slice(1)){for(let k=0;k<300;k++){const p=actor.body.translation(),dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.08)break;const q=Math.min(.1,d)/d;cc.computeColliderMovement(actor.col,{x:dx*q,y:-.012,z:dz*q},undefined,groups(G.PLAYER,G.STATIC));const m=cc.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});ph.world.step();}const p=actor.body.translation();assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.15,`${label}: physical route blocked at ${target.x},${target.z}, body=${JSON.stringify(p)}`);}}
 finally{ph.world.removeCharacterController(cc);ph.removeBody(actor.body);}
}
function physicalPath(ph,source,start,spot){
 const nav=new NavGrid(source.layout,.5);nav.blockedEdges=source.blockedEdges;for(let z=0;z<nav.h;z++)for(let x=0;x<nav.w;x++){const p=nav.toWorld(x,z);if(!source.walkableAt(p.x,p.z))nav.walk[z*nav.w+x]=0;}
 const [sx,sz]=nav.nearestWalkable(...nav.toGrid(start.x,start.z)),[tx,tz]=nav.nearestWalkable(...nav.toGrid(spot.x,spot.z)),goal=tz*nav.w+tx,q=[sz*nav.w+sx],seen=new Map([[q[0],-1]]);
 for(let n=0;n<q.length;n++){const a=q[n];if(a===goal)break;const x=a%nav.w,z=Math.floor(a/nav.w);for(let d=0;d<4;d++){const nx=x+[1,0,-1,0][d],nz=z+[0,1,0,-1][d],b=nz*nav.w+nx;if(seen.has(b)||!nav.canStep(x,z,nx,nz))continue;const pa=nav.toWorld(x,z),pb=nav.toWorld(nx,nz),dx=pb.x-pa.x,dz=pb.z-pa.z;let clear=true;ph.world.intersectionsWithShape({x:pb.x,y:nav.y+1.0,z:pb.z},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.5,.36),()=>{clear=false;return false;},undefined,groups(G.PLAYER,G.STATIC));for(const offset of [-.36,0,.36])for(const h of [.4,1.25])if(ph.raycast(new THREE.Vector3(pa.x+dz*2*offset,nav.y+h,pa.z-dx*2*offset),new THREE.Vector3(dx*2,0,dz*2),.5,G.STATIC)){clear=false;break;}if(!clear)continue;seen.set(b,a);q.push(b);}}
 assert.ok(seen.has(goal),'native nav plus actual body-clearance graph reaches optional room');const ids=[];for(let a=goal;a!==-1;a=seen.get(a))ids.push(a);return ids.reverse().map(i=>nav.toWorld(i%nav.w,Math.floor(i/nav.w)));
}
for(const theme of ['threadarchive','bufferfoundry'])for(const seed of [17,42,77])for(const size of [.5,1]){
 const L=generateLayout(seed,theme,size),copy=generateLayout(seed,theme,size);assert.deepEqual([...L.cells],[...copy.cells],'seeded layout stable');
 const ph=new Physics(),fac=buildFacility(L,{physics:ph,lightPool:{add:e=>e,remove(){}}});ph.world.step();assert.ok(fac.mainDoor);assert.ok(fac.lab.optionalRooms.length>=2);assert.equal(fac.lab.metrics.emitters,0);assert.ok(fac.lab.metrics.batches<=6);assert.ok(fac.lab.metrics.triangles<1500);
 const entry=L.entrySources[0],start={x:L.ox+(entry%L.w+.5)*L.cell,z:L.oz+(Math.floor(entry/L.w)+.5)*L.cell};
 // Ordinary doors are player-openable. Required native locks remain blocked in nav.
 for(const d of fac.doors)if(!d.locked&&d.info?.key)fac.nav.blockedEdges.delete(d.info.key);
 let redundant=0;
 for(const d of fac.doors){if(d.kind!=='door'||d.locked||!d.info)continue;const {key,a,b}=d.info;if(!fac.lab.optionalRooms.includes(L.roomOf[a])&&!fac.lab.optionalRooms.includes(L.roomOf[b]))continue;
 const point=i=>({x:L.ox+(i%L.w+.5)*L.cell,z:L.oz+(Math.floor(i/L.w)+.5)*L.cell});fac.nav.blockedEdges.add(key);const pa=point(a),pb=point(b);if(fac.nav.findPath(start.x,start.z,pa.x,pa.z,90000)&&fac.nav.findPath(start.x,start.z,pb.x,pb.z,90000))redundant++;fac.nav.blockedEdges.delete(key);}
 assert.ok(redundant>0,`${theme}/${seed}/${size}: no safe optional collapse edge`);
 for(const spot of fac.lab.detours){const path=fac.nav.findPath(start.x,start.z,spot.x,spot.z,90000);assert.ok(path,`${theme}: detour return unavailable`);walk(ph,L,physicalPath(ph,fac.nav,start,spot),`${theme}/${seed}/${size}`);}
 const root=fac.group.getObjectByName(`lab20-${theme}`),geo=new Set();root.traverse(o=>{if(o.geometry)geo.add(o.geometry)});let disposed=0;for(const g of geo)g.addEventListener('dispose',()=>disposed++);fac.dispose(ph);assert.equal(disposed,geo.size,'new landmark geometry released exactly once');assert.equal(ph.info.size,0);ph.world.free();console.log(theme,seed,size,JSON.stringify(fac.lab.metrics),`optional=${fac.lab.optionalRooms.length} redundant=${redundant}`);
}
console.warn=warn;assert.deepEqual(warnings,[],'builders must not emit runtime errors');console.log('lab20 native route/lifecycle regression PASS');
