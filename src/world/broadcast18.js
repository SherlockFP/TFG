// 56K-Dialup's authored Relay Ward. Pure seeded planning precedes outdoor scatter; geometry never owns game economy.
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { LabBuilder } from './interiors/lab_kit.js';
import { G } from '../physics/physics.js';
const V=THREE.Vector3, freezePoint=p=>Object.freeze(new V(p.x,p.y,p.z));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const segmentDistance=(x,z,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);};
/** Hamsi-only. Facades can fall back independently; an unrelated rough sample cannot discard the complete street. */
export function planBroadcast18({moon,terrain,plan}) {
  if(moon?.id!=='hamsi'||!terrain?.pathPts||terrain.hook||terrain.lava)return null;
  const path=terrain.pathPts, height=(x,z)=>terrain.heightAt(x,z), entrance=plan.entrance;
  const at=f=>{const i=Math.round(f*(path.length-1)),p=path[i],a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],len=dist(a,b)||1;return {x:p.x,z:p.z,tx:(b.x-a.x)/len,tz:(b.z-a.z)/len};};
  const safe=(x,z,r)=>Number.isFinite(height(x,z))&&Math.hypot(x,z)>22+r&&Math.hypot(x-entrance.x,z-entrance.z)>13+r&&!terrain.blocked?.(x,z,r)&&!plan.ponds.some(p=>Math.hypot(x-p.x,z-p.z)<p.r*1.5+r+1)&&!plan.fires.some(p=>Math.hypot(x-p.x,z-p.z)<8+r);
  const compact=dist(path[0],path.at(-1))<65;
  const buildings=[];
  const specs=[{f:.24,side:-1,offset:12,w:6,d:4,h:5,type:'reel-house'}, {f:.41,side:1,offset:13,w:7,d:4,h:7,type:'transmitter'}, {f:.58,side:-1,offset:14,w:7.5,d:4.5,h:4.5,type:'switchboard'}, {f:.75,side:1,offset:12,w:5.5,d:4,h:5.8,type:'dead-studio'}];
  for(const spec of specs) {
    const a=at(spec.f),nx=-a.tz,nz=a.tx;let chosen=null;
    for(const side of [spec.side,-spec.side]) {
    for(const offset of [spec.offset,spec.offset+4,spec.offset+8,spec.offset+12,spec.offset+16]) {
      if(compact && side>0 && offset<22)continue;
      const x=a.x+nx*offset*side,z=a.z+nz*offset*side,r=Math.hypot(spec.w,spec.d)/2;
      if(!safe(x,z,r))continue;
      const samples=[[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5],[0,0]].map(([sx,sz])=>height(x+a.tx*sx*spec.w+nx*sz*spec.d,z+a.tz*sx*spec.w+nz*sz*spec.d));
      if(!samples.every(Number.isFinite))continue;
      chosen=Object.freeze({...spec,x,z,nx,nz,tx:a.tx,tz:a.tz,rotY:Math.atan2(-a.tz,a.tx),baseY:Math.min(...samples)-.15,topY:Math.max(...samples),side});break;
    }
    if(chosen)break;
    }
    if(chosen)buildings.push(chosen);
  }
  if(buildings.length<3)return null;
  // The street survives a seed's inward bend: seek another REAL safe passage, never reduce exclusion zones.
  const pairs=compact?[[.45,.70],[.50,.74],[.52,.78],[.42,.68],[.54,.80],[.33,.83],[.30,.85]]:[[.39,.61],[.45,.70],[.50,.74],[.34,.66],[.30,.82]];
  const baseOffset=compact?16:8;
  const hitsBuilding=(x,z)=>buildings.some(b=>{
    const dx=x-b.x,dz=z-b.z,along=dx*b.tx+dz*b.tz,across=dx*b.nx+dz*b.nz;
    const body=Math.abs(along)<b.w/2+.25&&Math.abs(across)<b.d/2+.25;
    const front=-b.side*(b.d/2+.035);
    const fallenTape=Math.abs(along-b.w*.26)<1 && Math.abs(across-(front-b.side*.6))<.55;
    const studioCover=b.type==='dead-studio'&&Math.abs(along+b.w*.38)<.8&&Math.abs(across-(front-b.side*1.2))<.85;
    return body||fallenTape||studioCover;
  });
  const routeClear=(a,b,width)=>{
    const length=dist(a,b),sx=-(b.z-a.z)/(length||1),sz=(b.x-a.x)/(length||1);
    for(let i=0,n=Math.max(1,Math.ceil(length));i<=n;i++)for(const side of [-width,0,width]){
      const t=i/n,x=a.x+(b.x-a.x)*t+sx*side,z=a.z+(b.z-a.z)*t+sz*side;
      if(hitsBuilding(x,z))return false;
    }
    return true;
  };
  let selected=null;
  search:for(const [fa,fb] of pairs)for(const side of [1,-1])for(const offset of [baseOffset,baseOffset+4,baseOffset+8,baseOffset+12,baseOffset+16,baseOffset+20]) {
    const a=at(fa),b=at(fb),len=dist(a,b);if(len<6)continue;
    const tx=(b.x-a.x)/len,tz=(b.z-a.z)/len,nx=-tz*side,nz=tx*side;
    const entry={x:a.x+nx*offset,z:a.z+nz*offset},exit={x:b.x+nx*offset,z:b.z+nz*offset},gate={x:(entry.x+exit.x)/2,z:(entry.z+exit.z)/2};
    if(![entry,exit,gate].every(p=>safe(p.x,p.z,2.5)))continue;
    if(!routeClear(a,entry,.55)||!routeClear(entry,exit,2.6)||!routeClear(exit,b,.55))continue;
    const control={x:gate.x-nx*3.2-tx*1.8,z:gate.z-nz*3.2-tz*1.8};
    const approach={x:control.x-nx*1.8,z:control.z-nz*1.8};
    if(!routeClear(control,approach,.55))continue;
    const gateHeights=[-2,0,2].map(s=>height(gate.x+nx*s,gate.z+nz*s));
    if(!gateHeights.every(Number.isFinite))continue;
    selected={a,b,tx,tz,nx,nz,entry,exit,gate,gateHeights,rotY:Math.atan2(-tz,tx)};break search;
  }
  if(!selected)return null;
  const {a,b,tx,tz,nx,nz,entry,exit,gate,gateHeights,rotY}=selected;
  const baseY=Math.min(...gateHeights)-.35,gateH=Math.max(...gateHeights)-baseY+3.2;
  const console={x:gate.x-nx*3.2-tx*1.8,z:gate.z-nz*3.2-tz*1.8};console.y=height(console.x,console.z)+1.3;
  const shortcutDoor=Object.freeze({pos:freezePoint({x:gate.x,y:baseY+gateH/2,z:gate.z}),size:Object.freeze([.28,gateH,4.4]),rotY,baseY});
  const groundPoint=p=>freezePoint({x:p.x,y:height(p.x,p.z)+.1,z:p.z});
  let replayAnchor=null,replayApproach=null;
  replaySearch:for(const b of buildings.filter(b=>b.type==='transmitter'||b.type==='reel-house').sort((a,b)=>(a.type==='transmitter'?-1:1)-(b.type==='transmitter'?-1:1)))for(const along of [0,-b.w*.25,b.w*.25,-b.w*.38,b.w*.38])for(const setback of [1.7,2.5,3.3,4.5,5.5]){
    const across=-b.side*(b.d/2+setback),p={x:b.x+b.tx*along+b.nx*across,z:b.z+b.tz*along+b.nz*across},a={x:p.x-b.nx*b.side*1.8,z:p.z-b.nz*b.side*1.8};
    if(safe(p.x,p.z,1.5)&&safe(a.x,a.z,.5)&&routeClear(p,a,.55)&&Math.abs(height(p.x,p.z)-height(a.x,a.z))<1){replayAnchor=p;replayApproach=groundPoint(a);break replaySearch;}
  }
  const replayControl=replayAnchor?freezePoint({...replayAnchor,y:height(replayAnchor.x,replayAnchor.z)+1.25}):null;
  const mainReturn=Object.freeze(path.map(groundPoint));
  const result={name:'Relay Ward',console:freezePoint(console),shortcutDoor,replayControl,replayApproach,
    serviceEntry:groundPoint(entry),serviceExit:groundPoint(exit),serviceRoute:Object.freeze([groundPoint(a),groundPoint(entry),groundPoint(gate),groundPoint(exit),groundPoint(b)]),
    waypoints:Object.freeze({approach:groundPoint(at(.15)),street:groundPoint(at(.4)),relay:groundPoint(at(.6)),entrance:groundPoint(path.at(-1)),console:freezePoint(console)}),
    mainReturn,mainEntry:groundPoint(a),mainExit:groundPoint(b),basepoints:Object.freeze(buildings.map(p=>groundPoint(p))),buildings:Object.freeze(buildings),axis:Object.freeze({tx,tz,nx,nz}),entry:Object.freeze(entry),exit:Object.freeze(exit)};
  return Object.freeze(result);
}
/** Reserve only authored foundations and passage, so ordinary seeded scatter cannot spawn rocks inside them. */
export function broadcast18Reserved(plan,x,z,m=0) {
  if(!plan)return false;
  if(plan.replayControl&&Math.hypot(x-plan.replayControl.x,z-plan.replayControl.z)<3+m)return true;
  if(plan.buildings.some(b=>Math.hypot(x-b.x,z-b.z)<Math.hypot(b.w,b.d)/2+1.5+m))return true;
  return segmentDistance(x,z,plan.entry,plan.exit)<4.5+m || segmentDistance(x,z,plan.mainEntry,plan.entry)<2.5+m || segmentDistance(x,z,plan.exit,plan.mainExit)<2.5+m;
}
export function buildBroadcast18({plan,terrain,group:parent,physics}) {
  if(!plan)return null;
  const group=new THREE.Group();group.name='relay-ward18';parent.add(group);
  const B=new LabBuilder({Y:0,group,GeoBuilder,levelMaterial});const colliders=[],materials=new Set();let powered=true,gateCollider=null,disposed=false;
  const solid=(key,x,y,z,w,h,d,rotY=0)=>{B.rbox(key,x,y,z,w,h,d,rotY);const col=physics.addStaticBox(x,y,z,w/2,h/2,d/2,rotY,G.STATIC,{kind:'prop',id:'broadcast18'});colliders.push(col);return col;};
  const local=(b,x,y,z)=>new V(b.x+b.tx*x+b.nx*z,b.topY+y,b.z+b.tz*x+b.nz*z);
  const part=(b,key,x,y,z,w,h,d,physical=false)=>{const p=local(b,x,y,z);if(physical)solid(key,p.x,p.y,p.z,w,h,d,b.rotY);else B.rbox(key,p.x,p.y,p.z,w,h,d,b.rotY);};
  function reel(b,x,y,z,r) {
    const center=local(b,x,y,z),geo=B.gb,axis=new V(b.tx,0,b.tz),up=new V(0,1,0);
    for(let k=0;k<16;k++){const a=k*Math.PI/8,c=(k+1)*Math.PI/8,p=center.clone().addScaledVector(axis,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r),q=center.clone().addScaledVector(axis,Math.cos(c)*r).addScaledVector(up,Math.sin(c)*r);geo.quad('m:metal_plate',center,b.side<0?p:q,b.side<0?q:p,center,[[0,0],[1,0],[1,1],[0,0]]);}
    part(b,'m:metal_dark',x,y,z+b.side*.015,r*.5,r*.5,.08);
  }
  for(const b of plan.buildings) {
    const front=-b.side*(b.d/2+.035),bodyH=b.h+b.topY-b.baseY;
    // Massive foundations reach actual lowest sampled ground; visible facade height follows its own local hill.
    solid(b.type==='reel-house'?'m:brick':'m:concrete_dark',b.x,b.baseY+bodyH/2,b.z,b.w,bodyH,b.d,b.rotY);
    part(b,'m:metal_dark',-.3,b.h+.12,0,b.w+1,.25,b.d+.7);
    // Front windows are inset-looking dark shutters with dim unlit indicators, not added Three lights.
    for(const x of [-b.w*.28,b.w*.18]) {part(b,'m:metal_dark',x,2.3,front,1.4,1.5,.08);part(b,'g:536c70',x,2.3,front-b.side*.045,1.1,.6,.02);}
    part(b,'m:metal_plate',-b.w*.27,.9,front,.85,1.8,.1);
    if(b.type==='reel-house') {reel(b,-1.2,b.h-1.2,front-b.side*.12,.8);reel(b,1,b.h-1.2,front-b.side*.12,.65);part(b,'m:metal_dark',0,b.h-.65,front,4,.2,.18);}
    if(b.type==='transmitter') {
      part(b,'m:metal_plate',-b.w*.2,b.h+3.5,0,.3,7,.3);
      for(let i=0;i<4;i++)part(b,'m:metal_plate',-b.w*.2,b.h+1.5+i*1.3,0,3-i*.4,.12,.12);
      part(b,'g:a47752',-b.w*.2,b.h+7.05,0,.28,.22,.28);
      part(b,'m:metal_dark',2,b.h+1.2,0,1.8,2.4,2.2);
    }
    if(b.type==='switchboard') {
      for(let i=0;i<4;i++){part(b,'m:metal_dark',-2.4+i*1.6,1.35,front-b.side*.3,1.2,2.7,.55);part(b,'g:647e68',-2.4+i*1.6,2,front-b.side*.6,.65,.15,.03);}
      part(b,'m:metal_plate',1,b.h+.45,0,4.4,.7,1.2);
    }
    if(b.type==='dead-studio') {
      part(b,'m:metal_dark',0,b.h-1,front,4,1.2,.15);for(let i=0;i<5;i++)part(b,'g:8b6757',-1.5+i*.65,b.h-1,front-b.side*.1,.22,.45+.12*i,.03);
      part(b,'m:metal_plate',-b.w*.38,.65,front-b.side*1.2,1.1,1.3,1.2,true);
    }
    // Asymmetric weathered awning and exterior fallen tapes give each facade a different rhythm.
    part(b,'m:metal_dark',b.w*.18,3.3,front-b.side*.6,b.w*.62,.12,1.2);
    part(b,'m:metal_plate',b.w*.26,.18,front-b.side*.6,1.5,.35,.6,true);
  }
  const {tx,tz,nx,nz}=plan.axis, length=dist(plan.entry,plan.exit),gate=plan.shortcutDoor,mid=gate.pos;
  // Short, sheltered service passage: two end openings to the normal street always stay available.
  for(const side of [-1,1]) for(const along of [-length*.25,length*.25]) {
    const x=mid.x+tx*along+nx*side*2.4,z=mid.z+tz*along+nz*side*2.4,y=terrain.heightAt(x,z);
    solid('m:metal_dark',x,y+1.05,z,length*.48,2.1,.22,gate.rotY);
    B.rbox('g:536c70',x,y+2.14,z,length*.48,.08,.12,gate.rotY);
  }
  // Raised shutter has a real gantry rather than floating above the alley when powered.
  const frameH=gate.size[1]*2+.7;
  for(const side of [-1,1])solid('m:metal_dark',mid.x+nx*side*2.55,gate.baseY+frameH/2,mid.z+nz*side*2.55,.38,frameH,.32,gate.rotY);
  solid('m:metal_plate',mid.x,gate.baseY+frameH-.12,mid.z,.5,.25,5.5,gate.rotY);
  // Console stand collider ends below the interactable, so ray interaction is not swallowed by its own housing.
  const c=plan.console;solid('m:metal_dark',c.x,c.y-.72,c.z,.48,1.05,.45,gate.rotY);
  B.rbox('m:metal_plate',c.x,c.y,c.z,.75,.42,.18,gate.rotY);
  B.rbox('g:647e68',c.x,c.y,c.z,.55,.17,.2,gate.rotY);
  const rc=plan.replayControl;
  if(rc){solid('m:metal_dark',rc.x,rc.y-.65,rc.z,.5,.95,.5);B.rbox('m:metal_plate',rc.x,rc.y,rc.z,.8,.4,.45,0);B.rbox('m:metal_dark',rc.x,rc.y+.27,rc.z,.5,.12,.35,0);}
  // Twin exposed tape reels belong to the physical transmitter control, not a floating screen.
  if(rc)for(const side of [-1,1]){
    const center=new V(rc.x+side*.19,rc.y+.34,rc.z);
    for(let k=0;k<8;k++){const a=k*Math.PI/4,b=(k+1)*Math.PI/4,p=center.clone().add(new V(Math.cos(a)*.16,0,Math.sin(a)*.16)),q=center.clone().add(new V(Math.cos(b)*.16,0,Math.sin(b)*.16));B.gb.quad('m:metal_plate',center,q,p,center,[[0,0],[1,0],[1,1],[0,0]]);}
    B.rbox('m:metal_dark',center.x,center.y+.015,center.z,.055,.035,.055,0);
  }
  const staticMeshes=B.build('relay-ward18-static');staticMeshes.traverse(o=>{if(o.material){o.material=o.material.clone();materials.add(o.material);}});
  const gateMesh=new THREE.Mesh(new THREE.BoxGeometry(...gate.size),new THREE.MeshLambertMaterial({color:0x566770}));gateMesh.position.copy(gate.pos);gateMesh.rotation.y=gate.rotY;group.add(gateMesh);materials.add(gateMesh.material);
  const gateIndicator=new THREE.Mesh(new THREE.BoxGeometry(.06,.18,3.8),new THREE.MeshBasicMaterial({color:0x66886f}));gateIndicator.rotation.y=gate.rotY;gateIndicator.position.copy(gate.pos);gateIndicator.position.y=gate.baseY+gate.size[1]-.3;group.add(gateIndicator);materials.add(gateIndicator.material);
  let replayIndicator=null;
  if(rc){replayIndicator=new THREE.Mesh(new THREE.BoxGeometry(.84,.06,.49),new THREE.MeshBasicMaterial({color:0x687a80}));replayIndicator.position.copy(rc);replayIndicator.position.y+=.23;group.add(replayIndicator);materials.add(replayIndicator.material);}
  const setReplay=stage=>{if(!disposed&&replayIndicator)replayIndicator.material.color.setHex(({warning:0xb38a48,live:0xd1a15a,spent:0x493e3a,idle:0x687a80})[stage]||0x687a80);};
  function setPowered(on) {
    if(disposed)return;powered=!!on;
    if(powered) {if(gateCollider){physics.removeCollider(gateCollider);gateCollider=null;}gateMesh.position.y=gate.pos.y+gate.size[1]+.25;gateIndicator.material.color.setHex(0x66886f);}
    else {gateMesh.position.copy(gate.pos);if(!gateCollider)gateCollider=physics.addStaticBox(gate.pos.x,gate.pos.y,gate.pos.z,gate.size[0]/2,gate.size[1]/2,gate.size[2]/2,gate.rotY,G.STATIC,{kind:'prop',id:'broadcast18-gate'});gateIndicator.material.color.setHex(0x995e4f);}
  }
  function canClose(pos,radius=.45,height=1.8) {
    const dx=pos.x-gate.pos.x,dz=pos.z-gate.pos.z,cs=Math.cos(gate.rotY),sn=Math.sin(gate.rotY),x=dx*cs-dz*sn,z=dx*sn+dz*cs;
    return !(Math.abs(x)<gate.size[0]/2+radius+.15&&Math.abs(z)<gate.size[2]/2+radius+.15&&pos.y<gate.pos.y+gate.size[1]/2+.1&&pos.y+height>gate.baseY-.1);
  }
  setPowered(true);
  return {plan,group,setPowered,setReplay,canClose,get gateCollider(){return gateCollider;},get powered(){return powered;},dispose(){if(disposed)return;disposed=true;if(gateCollider)physics.removeCollider(gateCollider);gateCollider=null;for(const col of colliders)physics.removeCollider(col);colliders.length=0;group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const material of materials)material.dispose();}};
}
