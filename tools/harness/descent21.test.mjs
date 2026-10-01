import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {NavGrid} from '../../src/world/nav.js';
import {initPhysics,Physics,G,groups,RAPIER} from '../../src/physics/physics.js';
import {newDescent,discovered,stageRequest} from '../../src/game/descent21_state.js';
import {buildDescent21} from '../../src/world/descent21.js';
await initPhysics();
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

const cases=[...['threadarchive','bufferfoundry','office','serverfarm','factory'].flatMap(theme=>[17,42].map(seed=>({theme,seed,size:1.1}))),...[1,2,3,4,5,6,7,17,42,77].map(seed=>({theme:'factory',seed,size:.8}))];
for(const {theme,seed,size} of cases){
 const L=generateLayout(seed,theme,size),ph=new Physics(),fac=buildFacility(L,{physics:ph,lightPool:{add:e=>e,remove(){}}});ph.world.step();const lobby=buildDescent21({facility:fac,physics:ph,floor:3});assert.ok(lobby,`${theme}/${seed}: safe lobby missing`);ph.world.step();
 assert.equal(lobby.metrics.colliders,3);assert.equal(lobby.metrics.emitters,0);assert.ok(lobby.metrics.batches<=5);assert.equal(lobby.plan.requiredRooms,15);assert.ok(lobby.plan.discoveryRooms.length>0);
 const entry=fac.mainDoor?.info?.a??L.entrySources[0],start={x:L.ox+(entry%L.w+.5)*L.cell,z:L.oz+(Math.floor(entry/L.w)+.5)*L.cell};
 for(const d of fac.doors)if(!d.locked&&d.info?.key)fac.nav.blockedEdges.delete(d.info.key);
 const path=physicalPath(ph,fac.nav,start,lobby.plan.approach);walk(ph,L,path,`${theme}/${seed}/approach`);
 walk(ph,L,[lobby.plan.approach,{x:lobby.plan.x,z:lobby.plan.z},lobby.plan.approach],`${theme}/${seed}/cabin`);
 for(const anchor of Object.values(lobby.anchors))assert.ok(ph.lineOfSight({x:lobby.plan.x,y:L.y+1.5,z:lobby.plan.z},anchor),'console native LOS');
 // Trusted isolated preflight is consumable on a newly built live world BEFORE any simulation step.
 const livePh=new Physics(),liveFac=buildFacility(generateLayout(seed,theme,size),{physics:livePh,lightPool:{add:e=>e,remove(){}}});
 const step=livePh.world.step,overlap=livePh.overlapSphere,ray=livePh.raycast,intersections=livePh.world.intersectionsWithShape;
 livePh.world.step=()=>{throw Error('verified builder advanced live simulation')};livePh.overlapSphere=livePh.raycast=livePh.world.intersectionsWithShape=()=>{throw Error('verified builder queried stale live scene')};
 assert.equal(buildDescent21({facility:liveFac,physics:livePh,verifiedPlan:{...lobby.plan,fingerprint:{...lobby.plan.fingerprint,seed:seed+1}}}),null,'foreign layout certificate rejected');
 const live=buildDescent21({facility:liveFac,physics:livePh,floor:3,verifiedPlan:JSON.parse(JSON.stringify(lobby.plan))});assert.ok(live,'certified plan installs without live step/query');assert.deepEqual(live.plan,lobby.plan);assert.deepEqual(live.metrics,lobby.metrics);
 livePh.world.step=step;livePh.overlapSphere=overlap;livePh.raycast=ray;livePh.world.intersectionsWithShape=intersections;livePh.world.step();walk(livePh,liveFac.layout,[live.plan.approach,{x:live.plan.x,z:live.plan.z},live.plan.approach],`${theme}/certified-cabin`);live.dispose();liveFac.dispose(livePh);assert.equal(livePh.info.size,0);livePh.world.free();
 const texture=lobby.group.children.find(o=>o.material?.map?.isCanvasTexture).material.map,initialVersion=texture.version;
 for(let i=0;i<100;i++)lobby.setState({discovered:false,available:false,busy:false,floor:3});assert.equal(texture.version,initialVersion,'unchanged state must not upload canvas');
 lobby.setState({busy:true});assert.equal(texture.version,initialVersion+1,'one transition uploads exactly once');for(let i=0;i<100;i++)lobby.setState({busy:true});assert.equal(texture.version,initialVersion+1);
 let disposed=0;const geometries=new Set();lobby.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry)});for(const g of geometries)g.addEventListener('dispose',()=>disposed++);lobby.setState({discovered:true,available:true,floor:4});lobby.dispose();lobby.dispose();assert.equal(disposed,geometries.size);fac.dispose(ph);assert.equal(ph.info.size,0);ph.world.free();console.log(theme,seed,`room=${lobby.plan.roomId}`,JSON.stringify(lobby.metrics));
}
console.log('descent21 native capsule/entry/lifecycle PASS');

// A real starter ring has an ordinary locked entrance link, not a permanently sealed facility.
{
 const ph=new Physics(),L=generateLayout(17,'factory',.68,{arch:'ring',roomMul:1.05}),fac=buildFacility(L,{physics:ph,lightPool:{add:e=>e,remove(){}}});ph.world.step();
 const entry=fac.mainDoor.info.a,start={x:L.ox+(entry%L.w+.5)*L.cell,z:L.oz+(Math.floor(entry/L.w)+.5)*L.cell},before=new Set(fac.nav.blockedEdges);
 const gated=fac.doors.find(d=>d.kind==='door'&&d.locked&&[d.info.a,d.info.b].some(i=>i>=0&&L.roomOf[i]===0));assert.ok(gated?.collider,'real ordinary entrance gate exists');
 const initiallyReachable=L.rooms.filter(r=>r.type!=='entrance'&&fac.nav.findPath(start.x,start.z,L.ox+(r.cx+.5)*L.cell,L.oz+(r.cz+.5)*L.cell,90000));assert.equal(initiallyReachable.length,0,'reproduce initial empty discovery paths');
 const lobby=buildDescent21({facility:fac,physics:ph});assert.ok(lobby);assert.equal(lobby.plan.roomId,0);assert.ok(lobby.plan.discoveryRooms.length>0,'metadata includes rooms after key-unlockable ordinary gate');assert.deepEqual(fac.nav.blockedEdges,before,'discovery cannot mutate real nav locks');assert.equal(gated.locked,true);assert.ok(gated.collider,'discovery cannot remove native locked collider');
 for(const id of lobby.plan.discoveryRooms){const r=L.rooms[id];assert.ok(!r.arena&&!r.maze&&!r.treasure&&!['vault','core','generator','nest','arena'].includes(r.type)&&!r.type.startsWith('m2_'),'required/special gates remain excluded');}
 const info=gated.info,a={x:L.ox+(info.a%L.w+.5)*L.cell,z:L.oz+(Math.floor(info.a/L.w)+.5)*L.cell},b={x:L.ox+(info.b%L.w+.5)*L.cell,z:L.oz+(Math.floor(info.b/L.w)+.5)*L.cell},dir=new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize();assert.ok(ph.raycast(new THREE.Vector3(a.x,L.y+1,a.z),dir,L.cell, G.DOOR),'actual locked entrance still blocks body ray');
 const state=newDescent({moon:'hamsi',seed:17,day:1});assert.equal(discovered(state,lobby.plan),false);assert.equal(stageRequest(state,'call',0,discovered(state,lobby.plan)),false,'eligible rooms do not authorize an unvisited call');
 lobby.dispose();fac.dispose(ph);assert.equal(ph.info.size,0);ph.world.free();console.log('descent21 actual ring locked ordinary discovery eligibility PASS');
}
