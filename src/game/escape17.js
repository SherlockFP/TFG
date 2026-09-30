// Geometry-only planning. Queries run during landing readiness, never in the movement hot loop.
import * as THREE from 'three';
import { RAPIER, G, groups } from '../physics/physics.js';
const MASK=G.STATIC|G.DOOR, Q={x:0,y:0,z:0,w:1}, DOWN={x:0,y:-1,z:0};
const PLAYER_RADIUS=.34, HALF=.56;
const capsule=new RAPIER.Capsule(HALF,PLAYER_RADIUS),wardenCapsule=new RAPIER.Capsule(.625,.55);
const a=new THREE.Vector3(),b=new THREE.Vector3();
export function floorClear(game,p){
 const nav=game.world?.facility?.nav;if(!nav?.walkableAt(p.x,p.z))return false;
 for(const[dx,dz]of [[0,0],[.34,0],[-.34,0],[0,.34],[0,-.34]]){
  const hit=game.physics.raycast({x:p.x+dx,y:p.y+1,z:p.z+dz},DOWN,1.3,MASK);
  if(!hit||hit.normal.y<.65||Math.abs(hit.point.y-p.y)>.2)return false;
 }
 return true;
}
export function bodyClear(game,p){
 if(!floorClear(game,p)||!game.physics.world?.intersectionsWithShape)return false;
 let clear=true;
 game.physics.world.intersectionsWithShape({x:p.x,y:p.y+.92,z:p.z},Q,capsule,()=>{clear=false;return false;},undefined,groups(0xffff,MASK),game.player?.col,game.player?.body);
 return clear;
}
export function bodySegment(game,from,to){
 if(!bodyClear(game,from)||!bodyClear(game,to)||!game.physics.world?.castShape)return false;
 const d=Math.hypot(to.x-from.x,to.z-from.z),n=Math.max(1,Math.ceil(d/.5));
 for(let i=1;i<n;i++){a.lerpVectors(from,to,i/n);if(!floorClear(game,a))return false;}
 return !game.physics.world.castShape({x:from.x,y:from.y+.92,z:from.z},Q,{x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},capsule,.01,1,true,undefined,groups(0xffff,MASK),game.player?.col,game.player?.body);
}
export function bodyRoute(game,points){
 if(!points.length||!bodyClear(game,points[0]))return false;
 for(let i=1;i<points.length;i++)if(!bodySegment(game,points[i-1],points[i]))return false;
 return true;
}
export function wardenClear(game,p){
 if(!game.physics.world?.intersectionsWithShape)return false;
 let clear=true;game.physics.world.intersectionsWithShape({x:p.x,y:p.y+1.195,z:p.z},Q,wardenCapsule,()=>{clear=false;return false;},undefined,groups(0xffff,MASK));return clear;
}
export function wardenSegmentClear(game,from,to){
 if(!game.physics.world?.castShape)return false;
 return !game.physics.world.castShape({x:from.x,y:from.y+1.195,z:from.z},Q,{x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},wardenCapsule,.01,1,true,undefined,groups(0xffff,MASK));
}
export function flankRoutes(pos){
 const p=(x,z)=>new THREE.Vector3(pos.x+x,pos.y,pos.z+z),start=p(0,1.75),out=[];
 for(const sign of [-1,1]){
  const front=p(sign*1.5,1.9),side=p(sign*1.5,0),back=p(sign*1.5,-1.6),cover=p(0,-1.6);
  out.push([start,front,side,back,cover],[start,front,side]);
 }
 return out;
}
export function shelterPlacement(game,pos){
 // Reject occupied shell/interior and both body-width side corridors, including a real path behind it.
 for(const x of [-.5,0,.5])for(const z of [-.45,.35])if(!bodyClear(game,b.set(pos.x+x,pos.y,pos.z+z)))return false;
 const routes=flankRoutes(pos),left=routes[0],right=routes[2];
 return bodyRoute(game,left)&&bodyRoute(game,right);
}
export function* shelterPositions(L){
 let count=0;
 for(const r of L.rooms||[]){
  if(r.w<3||r.h<3||/entrance|vault|generator|arena|core|hub/.test(r.type||''))continue;
  const cx=L.ox+(r.x+r.w/2)*L.cell,cz=L.oz+(r.z+r.h/2)*L.cell;
  for(const[dx,dz]of [[0,0],[0,L.cell*.5],[0,-L.cell*.5],[L.cell*.5,0],[-L.cell*.5,0]]){
   if(++count>80)return;
   yield new THREE.Vector3(cx+dx,L.y,cz+dz);
  }
 }
}
export function coverOccluded(game,spawn,cover){
 a.copy(spawn);a.y+=1.88;b.copy(cover);b.y+=1.62;
 return !game.physics.lineOfSight(a,b,MASK);
}
export function addRouteMarks(root,points){
 const positions=[];
 // One static batch: fixed floor chevrons, no light, pulse, waypoint HUD or collision.
 for(let i=0;i<points.length-1;i++){
  const p=points[i],next=points[i+1],length=p.distanceTo(next),n=Math.max(1,Math.ceil(length/1.2));
  const angle=Math.atan2(-(next.x-p.x),-(next.z-p.z)),cos=Math.cos(angle),sin=Math.sin(angle);
  for(let j=0;j<n;j++){
   const t=(j+.4)/n,x=p.x+(next.x-p.x)*t,z=p.z+(next.z-p.z)*t;
   for(const[lx,lz]of [[-.16,.13],[.16,.13],[0,-.18]])positions.push(x+cos*lx+sin*lz,p.y+.027,z-sin*lx+cos*lz);
  }
 }
 if(!positions.length)return null;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const mat=new THREE.MeshBasicMaterial({color:0x80ccb8,transparent:true,opacity:.65,depthWrite:false}),mesh=new THREE.Mesh(geo,mat);mesh.name='escape17-route-marks';root.add(mesh);return mesh;
}
