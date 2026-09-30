// Company-only architectural replacement. Every solid wall remains owned by the native builder.
import * as THREE from 'three';
import { GeoBuilder, levelTexture } from './geobuilder.js';
import { t,onLangChange } from '../core/i18n.js';
import './exchange18_text.js';
const COLORS={shell:0x657876,edge:0x273d48,mint:0x77caba,amber:0xbd9a61,authority:0xb679a7,paper:0xc2c4aa,glass:0x87b9b1};
export function buildExchange18(parent,groundY=-1.25){
 const root=new THREE.Group();root.name='exchange18';parent.add(root);
 const gb=new GeoBuilder(),materials=[];
 const V=(x,y,z)=>new THREE.Vector3(x,groundY+y,z);
 const box=(key,x,y,z,w,h,d)=>gb.box(key,x,groundY+y,z,w,h,d,.3);
 function beam(key,a,b,w=.3,d=.4){
  const direction=b.clone().sub(a).normalize(),side=new THREE.Vector3(direction.y,-direction.x,0).multiplyScalar(w/2),depth=new THREE.Vector3(0,0,d/2);
  const p=[a.clone().add(side).add(depth),a.clone().sub(side).add(depth),b.clone().sub(side).add(depth),b.clone().add(side).add(depth),a.clone().add(side).sub(depth),a.clone().sub(side).sub(depth),b.clone().sub(side).sub(depth),b.clone().add(side).sub(depth)];
  for(const face of [[0,1,2,3],[7,6,5,4],[4,5,1,0],[3,2,6,7],[0,3,7,4],[5,6,2,1]])gb.quad(key,...face.map(i=>p[i]),[[0,0],[1,0],[1,1],[0,1]]);
 }
 // Asymmetric sorting bureau crest: stepped eaves feed one tall authority spine.
 // The lowest projecting edge is 7.3m over the pier; all native entrance lanes remain clear.
 for(const [x,y,w]of [[-11,9.4,12],[1,8.6,12],[11.5,7.6,9]]){
  box('shell',x,y,-19.72,w,.65,2.8);box('edge',x,y-.38,-18.33,w,.16,.12);
  box(x<0?'authority':x<8?'mint':'amber',x,y-.18,-18.24,w-.7,.13,.07);
 }
 box('edge',-14.9,11.6,-20.15,2.1,8.5,2.3);
 box('shell',-14.9,11.6,-18.97,1.7,8.5,.1);
 for(let i=0;i<5;i++)box('authority',-14.9,8.5+i*1.35,-18.86,1.4,.28,.1);
 beam('edge',V(-13.8,14.7,-20),V(-3,11.6,-20),.65,1.15);
 box('mint',-3,11.6,-19.4,.75,.75,.12);
 // Reading fins break the flat garage roof into an archive roofline.
 for(const x of [-9,-3,3,9]){
  box('shell',x,12,-29,.45,1.6,16);
  box('edge',x,12.85,-29,.8,.14,16);
 }
 // Glass replaces the visible east wall middle band. The existing solid wall collider remains.
 // Frames are flush to the collider boundary; no invisible walk-through furniture is introduced.
 gb.vrect('glass',16.94,-36,16.94,-22,groundY+1.2,groundY+5.8,.12);
 for(const z of [-36,-32.5,-29,-25.5,-22])box('shell',16.94,3.5,z,.06,4.7,.16);
 for(const y of [1.2,5.8])box('edge',16.94,y,-29,.06,.16,14);
 for(const z of [-34.2,-27.2]){
  box('authority',16.9,1.55,z,.025,.12,2);
  // Etched broken-square archive seals, not a generic warehouse grid.
  for(const y of [2.7,4.4])box('mint',16.88,y,z,.02,.045,1.1);
  box('mint',16.88,3.55,z-.55,.02,1.7,.045);
 }
 // A paired overhead sorter routes preserved packets to the archive and rejected ones to the west wall.
 // Lower bound 4.15m; packets are a curated static process snapshot, not a simulation or interaction promise.
 for(const x of [-12.8,12.8]){
  box('edge',x,4.4,-28,1.35,.3,13);
  for(const dx of [-.72,.72])box(x<0?'authority':'amber',x+dx,4.6,-28,.065,.12,13);
  for(const z of [-32,-28,-24]){
   box('paper',x,4.78,z,.72,.44,1.05);box(x<0?'authority':'mint',x,4.79,z+.54,.55,.12,.025);
   box('edge',x,7.4,z,.12,5.7,.12);
  }
 }
 // The forked overhead transfer directs attention toward the existing intake, without covering its receipt.
 beam('shell',V(-12.8,4.6,-34.5),V(-8.5,5.9,-34.5),.5,.9);
 beam('shell',V(12.8,4.6,-34.5),V(8.5,5.9,-34.5),.5,.9);
 box('edge',0,6,-37.15,17,.45,.9);box('mint',0,5.74,-36.64,16,.07,.04);
 // Flush rejection drawers use the existing west wall as their physical backing.
 // Their fronts protrude only .015m beyond its collision surface, at the body's visual boundary.
 for(const z of [-32.8,-28.6,-24.4]){
  box('edge',-16.945,1.6,z,.012,2.2,2.8);
  for(let i=0;i<3;i++){
   box('shell',-16.925,.85+i*.7,z,.015,.54,2.45);
   box('authority',-16.91,.85+i*.7,z-.9,.012,.11,.45);
   box('paper',-16.905,.85+i*.7,z+.65,.012,.16,.38);
  }
 }
 // The inherited fish-crate collision bounds now have visible sealed archive cartons, not invisible obstacles.
 function rotatedBox(key,cx,cy,cz,w,h,d,originX,originZ,yaw){
  const points=[];for(const [dx,dy,dz]of [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]){
   const x=cx+dx*w/2,z=cz+dz*d/2;points.push(V(originX+x*Math.cos(yaw)+z*Math.sin(yaw),cy+dy*h/2,originZ-x*Math.sin(yaw)+z*Math.cos(yaw)));
  }
  for(const face of [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]])gb.quad(key,...face.map(i=>points[i]),[[0,0],[1,0],[1,1],[0,1]]);
 }
 for(const [x,z,yaw]of [[30,18,.4],[-20,30,-.3]])for(const [cx,cy,cz]of [[-.45,0,0],[.45,0,.05],[0,.4,.02]]){
  rotatedBox('shell',cx,cy+.2,cz,.8,.4,.55,x,z,yaw);
  rotatedBox('amber',cx,cy+.405,cz,.12,.012,.56,x,z,yaw);
  rotatedBox('paper',cx+.18,cy+.25,cz+.278,.22,.14,.012,x,z,yaw);
 }
 // Upper side wall ribs terminate above heads and make the hall feel deliberately processed.
 for(const z of [-35,-29,-23])for(const x of [-16.9,16.9])box('shell',x,8.1,z,.1,4.1,.45);
 const material=(key)=>{
  const glass=key==='glass',bright=['mint','amber','authority'].includes(key);
  const m=new THREE.MeshLambertMaterial({color:COLORS[key],vertexColors:true,map:key==='edge'?levelTexture('metal_dark'):null,side:glass?THREE.DoubleSide:THREE.FrontSide,transparent:glass,opacity:glass?.22:1,depthWrite:!glass,emissive:bright?COLORS[key]:key==='shell'?0x354340:0,emissiveIntensity:bright?.25:.16});
  materials.push(m);return m;
 };
 root.add(gb.build(material));
 // One modest localized plaque atlas, four distinct evidence/story plaques rather than pasted branding.
 const signs=[
  {key:'SORT / PRESERVE / FORGET',p:V(0,6.35,-36.62),w:6.5,h:.44,yaw:0,color:'mint'},
  {key:'REJECTED: NO HUMAN RESPONSE',p:V(-16.88,3.15,-28.6),w:3.2,h:.48,yaw:Math.PI/2,color:'authority'},
  {key:'ARCHIVE GLASS / SEALED STORAGE',p:V(16.88,6.25,-29),w:6.2,h:.42,yaw:-Math.PI/2,color:'amber'},
  {key:'A copy survives. The author does not.',p:V(-16.88,3.15,-24.4),w:3.5,h:.48,yaw:Math.PI/2,color:'paper'},
 ];
 let off=()=>{};
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
  if(ctx){
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   const mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});materials.push(mat);
   const g=new GeoBuilder();
   signs.forEach((s,i)=>{
    const point=(x,y)=>new THREE.Vector3(s.p.x+x*Math.cos(s.yaw),s.p.y+y,s.p.z-x*Math.sin(s.yaw));
    g.quad('plaques',point(-s.w/2,-s.h/2),point(s.w/2,-s.h/2),point(s.w/2,s.h/2),point(-s.w/2,s.h/2),[[.002,1-(i+1)/4+.01],[.998,1-(i+1)/4+.01],[.998,1-i/4-.01],[.002,1-i/4-.01]]);
   });
   root.add(g.build(()=>mat));
   const draw=()=>{ctx.fillStyle='#172a31';ctx.fillRect(0,0,1024,256);signs.forEach((s,i)=>{ctx.fillStyle='#'+COLORS[s.color].toString(16).padStart(6,'0');ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText(t(s.key),512,i*64+43,984);});texture.needsUpdate=true;};draw();off=onLangChange(draw);
  }
 }
 let batches=0,triangles=0;root.traverse(o=>{if(o.isMesh){batches++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 const viewpoints=Object.freeze([
  {name:'sorting skyline',feet:[0,groundY,-12],target:[-5,groundY+9,-20],route:[[0,10],[-9.5,10],[-9.5,-12],[0,-12]]},
  {name:'native intake',feet:[.649,groundY+.02,-32.707],target:[0,groundY+1.8,-37],route:[[0,-12],[0,-32]]},
  {name:'rejection drawers',feet:[-12,groundY,-28.6],target:[-16.88,groundY+2.3,-28.6],route:[[0,-24],[-12,-24],[-12,-28.6]]},
  {name:'sealed archive glass',feet:[13.8,groundY,-29],target:[16.94,groundY+3,-29],route:[[0,-22],[14,-22],[14,-29]]},
 ].map(v=>Object.freeze({...v,feet:Object.freeze(v.feet),target:Object.freeze(v.target),route:Object.freeze(v.route.map(Object.freeze))})));
 return {root,viewpoints,metrics:{batches,triangles,lights:0,atlasPixels:1024*256},dispose(){off();root.traverse(o=>o.geometry?.dispose());for(const mat of materials){if(mat.map?.isCanvasTexture)mat.map.dispose();mat.dispose();}root.removeFromParent();}};
}
