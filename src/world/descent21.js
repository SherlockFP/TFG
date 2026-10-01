import * as THREE from 'three';
import {NavGrid} from './nav.js';
import {GeoBuilder} from './geobuilder.js';
import {planDescent21,descentFingerprint21,verifiedDescentPlan21} from './descent21_plan.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {t,onLangChange} from '../core/i18n.js';
import './descent21_text.js';
export function buildDescent21({facility,physics,floor=0,verifiedPlan=null,_rejected=new Set()}){
 // The placement probe is above floor; box footprint is tested separately against final nav.
 const safe=(x,z,y)=>{let hit=false;for(const dx of [-1.65,0,1.65])for(const dz of [-1.65,0,1.65])physics.overlapSphere({x:x+dx,y:y+1.55,z:z+dz},.37,G.STATIC|G.DOOR,()=>{hit=true;});return !hit;};
 const fingerprint=descentFingerprint21(facility);
 const reachable=verifiedPlan?()=>true:physicalReach21(facility,physics);
 const plan=verifiedPlan?verifiedDescentPlan21(facility,verifiedPlan):planDescent21(facility,{clear:(x,z,y)=>!_rejected.has(`${x},${z}`)&&safe(x,z,y),reachable});if(!plan||verifiedPlan&&plan.roomId!==verifiedPlan.roomId)return null;
 const root=new THREE.Group();root.name='descent21-lobby';root.position.set(plan.x,plan.y,plan.z);root.rotation.y=plan.yaw;facility.group.add(root);
 const gb=new GeoBuilder(),mats=[],owned=[],cols=[],box=(key,x,y,z,w,h,d)=>gb.box(key,x,y,z,w,h,d,.25);
 // Cabin sides/back are contained entirely within the existing clear room corner; mouth stays level.
 for(const [x,z,w,d]of [[-1.65,0,.18,3.4],[1.65,0,.18,3.4],[0,-1.65,3.4,.18]]){
  box('steel',x,1.4,z,w,2.8,d);const direction=plan.yaw===0?1:-1;cols.push(physics.addStaticBox(plan.x+x*direction,plan.y+1.4,plan.z+z*direction,w/2,1.4,d/2));
 }
 box('ivory',0,2.9,0,3.5,.18,3.5);box('ochre',0,2.6,1.65,3.3,.22,.24);
 for(const x of [-1.45,1.45])box('dark',x,1.3,1.65,.18,2.6,.22);
 // Separate physical consoles read left-to-right from the approach, never occupy the doorway.
 for(const x of [-1.05,0,1.05]){box('dark',x,1.0,-1.45,.56,.9,.25);box('ivory',x,1.28,-1.28,.4,.18,.04);}
 const palette={steel:0x626b70,ivory:0xbbb49e,ochre:0xa48a58,dark:0x30383d};root.add(gb.build(k=>{const m=new THREE.MeshLambertMaterial({color:palette[k],vertexColors:true,flatShading:true});mats.push(m);return m;}));
 const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;const ctx=signCanvas.getContext('2d'),tex=new THREE.CanvasTexture(signCanvas);tex.colorSpace=THREE.SRGBColorSpace;const signMat=new THREE.MeshBasicMaterial({map:tex});mats.push(signMat);const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.05,.76),signMat);sign.position.set(0,2.19,1.79);root.add(sign);
 let state={discovered:false,available:false,busy:false,floor},disposed=false;
 const draw=()=>{if(!ctx)return;ctx.fillStyle='#30383d';ctx.fillRect(0,0,512,128);ctx.fillStyle='#c7bea6';ctx.textAlign='center';ctx.font='bold 29px sans-serif';ctx.fillText(`${t('DEPTH TRANSIT')} / ${state.floor}`,256,39,492);ctx.font='20px sans-serif';ctx.fillText(t(state.busy?'TRANSIT BUSY':state.discovered?'CALL / DESCEND / RETURN':'EXPLORE TO AUTHORIZE'),256,85,492);tex.needsUpdate=true;};draw();const off=onLangChange(draw);
 const direction=plan.yaw===0?1:-1;
 const anchors=Object.freeze(Object.fromEntries(['call','descend','return'].map((key,i)=>[key,Object.freeze({x:plan.x+(i-1)*1.05*direction,y:plan.y+1.25,z:plan.z-1.2*direction})])));
 let batches=0,triangles=0;root.traverse(o=>{if(o.geometry){owned.push(o.geometry);o.geometry.userData.shared=true;batches++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});for(const m of mats)m.userData.shared=true;tex.userData.keep=true;
 const navBefore=facility.nav.walk.slice();
 // Reserve only the three actual walls, not the level open cab or approach.
 for(const [x,z,w,d]of [[-1.65,0,.18,3.4],[1.65,0,.18,3.4],[0,-1.65,3.4,.18]])facility.nav.blockBox(plan.x+x*direction-w/2,plan.z+z*direction-d/2,plan.x+x*direction+w/2,plan.z+z*direction+d/2,.15);
 const entry=facility.mainDoor?.info?.a??facility.layout.entrySources[0],L=facility.layout,start={x:L.ox+(entry%L.w+.5)*L.cell,z:L.oz+(Math.floor(entry/L.w)+.5)*L.cell};
 if(verifiedPlan?!facility.nav.findPath(start.x,start.z,plan.approach.x,plan.approach.z,90000):!physicalReach21(facility,physics,plan)(plan.approach.x,plan.approach.z)){
  off();for(const c of cols)physics.removeCollider(c);for(const g of owned)g.dispose();tex.dispose();for(const m of mats)m.dispose();root.removeFromParent();
  // Undo only our provisional nav writes; rebuilding the native grid is unnecessary.
  facility.nav.walk.set(navBefore);_rejected.add(`${plan.x},${plan.z}`);
  return !verifiedPlan&&_rejected.size<12?buildDescent21({facility,physics,floor,_rejected}):null;
 }
 const contract=Object.freeze({...plan,fingerprint,call:anchors.call,descend:anchors.descend,return:anchors.return,cabin:Object.freeze({center:plan.spawn,minX:plan.boundary.x0,maxX:plan.boundary.x1,minZ:plan.boundary.z0,maxZ:plan.boundary.z1,minY:plan.boundary.y0,maxY:plan.boundary.y1}),safeSpawns:Object.freeze([[-.55,-.55],[.55,-.55],[-.55,.55],[.55,.55]].map(([x,z])=>Object.freeze({x:plan.x+x,y:plan.y+.03,z:plan.z+z})))});
 return {group:root,plan:contract,anchors,metrics:{batches,triangles,emitters:0,colliders:cols.length},setState(next){if(disposed)return;const changed=['floor','discovered','available','busy'].some(key=>key in next&&next[key]!==state[key]);if(!changed)return;state={...state,...next};draw();},dispose(){if(disposed)return;disposed=true;off();for(const c of cols)physics.removeCollider(c);for(const g of owned)g.dispose();tex.dispose();for(const m of mats)m.dispose();root.removeFromParent();}};
}

// One bounded build-time flood: native locks/furniture plus the actual standing capsule footprint.
function physicalReach21(fac,physics,preview=null){
 const source=fac.nav,L=fac.layout,nav=new NavGrid(L,.5);nav.blockedEdges=source.blockedEdges;
 const total=nav.w*nav.h,seen=new Uint8Array(total),tested=new Uint8Array(total),safe=new Uint8Array(total),shape=new RAPIER.Capsule(.5,.36);
 const pass=(x,z)=>{if(!nav.inside(x,z))return false;const i=z*nav.w+x;if(tested[i])return !!safe[i];tested[i]=1;const p=nav.toWorld(x,z);if(preview){const sign=preview.yaw===0?1:-1,dx=(p.x-preview.x)*sign,dz=(p.z-preview.z)*sign;if((Math.abs(Math.abs(dx)-1.65)<.46&&Math.abs(dz)<2.06)||(Math.abs(dz+1.65)<.46&&Math.abs(dx)<2.06))return false;}if(!source.walkableAt(p.x,p.z))return false;let blocked=false;physics.world.intersectionsWithShape({x:p.x,y:L.y+1,z:p.z},{x:0,y:0,z:0,w:1},shape,()=>{blocked=true;return false;},undefined,groups(G.PLAYER,G.STATIC));safe[i]=blocked?0:1;return !blocked;};
 const entry=fac.mainDoor?.info?.a??L.entrySources[0],p={x:L.ox+(entry%L.w+.5)*L.cell,z:L.oz+(Math.floor(entry/L.w)+.5)*L.cell},[sx,sz]=nav.toGrid(p.x,p.z),q=[];
 if(pass(sx,sz)){seen[sz*nav.w+sx]=1;q.push(sz*nav.w+sx);}
 for(let n=0;n<q.length&&n<150000;n++){const a=q[n],x=a%nav.w,z=Math.floor(a/nav.w);for(let d=0;d<4;d++){const nx=x+[1,0,-1,0][d],nz=z+[0,1,0,-1][d];if(!nav.inside(nx,nz))continue;const b=nz*nav.w+nx;if(seen[b]||!nav.canStep(x,z,nx,nz)||!pass(nx,nz))continue;const pa=nav.toWorld(x,z),pb=nav.toWorld(nx,nz),dx=(pb.x-pa.x)*2,dz=(pb.z-pa.z)*2;let clear=true;for(const side of [-.36,0,.36])for(const h of [.4,1.25])if(physics.raycast({x:pa.x+dz*side,y:L.y+h,z:pa.z-dx*side},{x:dx,y:0,z:dz},.5,G.STATIC)){clear=false;break;}if(!clear)continue;seen[b]=1;q.push(b);}}
 return(x,z)=>{const [gx,gz]=nav.toGrid(x,z);return nav.inside(gx,gz)&&!!seen[gz*nav.w+gx];};
}
