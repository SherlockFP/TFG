// Static identity/wayfinding layer. Existing map owns all colliders and interaction anchors.
import * as THREE from 'three';
import { GeoBuilder, levelTexture } from './geobuilder.js';
import { t, onLangChange } from '../core/i18n.js';
import './port14_text.js';
const COLORS14={metal:0x354d59,rust:0x7d5443,mint:0x72cdbb,amber:0xc7a35d,plum:0xa982b3,dark:0x17272d,ivory:0xc4cabb,intake:0x809996,tray:0x586f6c};
export function dressPort14(parent,kind,groundY=-1.25){
 const C=kind==='hub'?{...COLORS14,metal:0x505653,rust:0x685849,mint:0xb2ad9e,amber:0x967d54,dark:0x252726,ivory:0xb7b3a6}:COLORS14;
 let receiptTab=null,receiptTime=0;
 const root=new THREE.Group();root.name=`port14-${kind}`;parent.add(root);
 const gb=new GeoBuilder(),floor=new GeoBuilder(),materials=[];
 const box=(key,x,y,z,w,h,d)=>gb.box(key,x,y,z,w,h,d,.35);
 const plate=(key,x0,z0,x1,z1)=>floor.hrect(key,x0,z0,x1,z1,groundY+.025,true,0);
 function route(key,points,width=.32){
  for(let i=1;i<points.length;i++){
   const [x0,z0]=points[i-1],[x1,z1]=points[i];
   if(x0===x1)plate(key,x0-width/2,Math.min(z0,z1),x1+width/2,Math.max(z0,z1));
   else if(z0===z1)plate(key,Math.min(x0,x1),z0-width/2,Math.max(x0,x1),z1+width/2);
  }
 }
 function arrow(key,x,z,yaw){
  const local=[[-.5,-.65],[.5,-.65],[.5,.3],[1,.3],[0,1.2],[-1,.3],[-.5,.3]];
  const verts=local.map(([px,pz])=>new THREE.Vector3(x+px*Math.cos(yaw)+pz*Math.sin(yaw),groundY+.03,z-px*Math.sin(yaw)+pz*Math.cos(yaw)));
  // Fans are split into nondegenerate triangles using a repeated vertex for GeoBuilder's quad API.
  for(let i=1;i<verts.length-1;i++)floor.quad(key,verts[0],verts[i+1],verts[i],verts[i],[[0,0],[0,0],[0,0],[0,0]]);
 }
 function beam(key,a,b,width=.24,depth=.3){
  const d=new THREE.Vector3().subVectors(b,a).normalize(),side=new THREE.Vector3(d.y,-d.x,0).multiplyScalar(width/2),dz=new THREE.Vector3(0,0,depth/2);
  const p=[a.clone().add(side).add(dz),a.clone().sub(side).add(dz),b.clone().sub(side).add(dz),b.clone().add(side).add(dz),a.clone().add(side).sub(dz),a.clone().sub(side).sub(dz),b.clone().sub(side).sub(dz),b.clone().add(side).sub(dz)];
  for(const face of [[0,1,2,3],[7,6,5,4],[4,5,1,0],[3,2,6,7],[0,3,7,4],[5,6,2,1]])gb.quad(key,...face.map(i=>p[i]),[[0,0],[1,0],[1,1],[0,1]]);
 }
 function ring(key,cx,cy,z,radius,thick=.2){
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4+Math.PI/8,b=(i+1)*Math.PI/4+Math.PI/8;
   const points=[new THREE.Vector3(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,z),new THREE.Vector3(cx+Math.cos(b)*radius,cy+Math.sin(b)*radius,z),new THREE.Vector3(cx+Math.cos(b)*(radius-thick),cy+Math.sin(b)*(radius-thick),z),new THREE.Vector3(cx+Math.cos(a)*(radius-thick),cy+Math.sin(a)*(radius-thick),z)];
   gb.quad(key,...(kind==='hub'?points.reverse():points),[[0,0],[1,0],[1,1],[0,1]]);
  }
 }
 const signs=[];
 const sign=(key,x,y,z,w,h=1.05,yaw=0,color='mint')=>signs.push({key,x,y,z,w,h,yaw,color});
 if(kind==='hub'){
  // A suspended transfer spine links the existing vessel cranes, clear of every walking route.
  box('metal',0,14.8,-8,58,1.1,1.4);box('mint',0,14.86,-7.25,58,.13,.04);
  for(const x of [-24,-12,0,12,24])beam('rust',new THREE.Vector3(x-4,14.3,-8),new THREE.Vector3(x+4,16.2,-8),.3,.7);
  box('metal',0,16.4,-8,58,.4,.7);
  // Vessel transfer jaws and routed relay crest give the office a silhouette at ground-level approach.
  for(const x of [-13,13]){
   box('metal',x,9.25,36.6,.5,6,.5);box('rust',x,12.55,36.6,1.8,.6,1.4);
   for(let k=0;k<4;k++)box('amber',x,8+k,36.25,.53,.15,.05);
  }
  beam('metal',new THREE.Vector3(-13,12.8,36.6),new THREE.Vector3(-4,15,36.6),.6,.7);
  beam('metal',new THREE.Vector3(13,12.8,36.6),new THREE.Vector3(4,15,36.6),.6,.7);
  ring('mint',0,12.6,36.1,2,.25);ring('metal',0,12.6,36.15,2.65,.42);
  box('amber',0,12.6,36,.55,.55,.15);
  // Office front is framed by structural skins over its existing side walls, not new collision.
  box('rust',-12.95,2.4,25,.4,7,.65);box('rust',12.95,2.4,25,.4,7,.65);
  box('metal',0,4,24.2,24,1.7,.5);box('mint',0,3.02,23.92,24,.09,.06);
  for(const x of [-10,10])beam('metal',new THREE.Vector3(x,3,24.2),new THREE.Vector3(x*.7,5.7,24.2),.25,.35);
  // Tall service pipe runs occupy wall skins; broad service apron remains empty.
  for(const x of [-12.4,12.4]){box('metal',x,1.6,35,.14,5.5,2.5);box('amber',x,4.35,35,.2,.16,2.6);}
  // Paint leads away from the spawn to distinct physical destinations.
  route('mint',[[1.8,23],[1.8,29.8]],.4);arrow('mint',1.8,27,0);
  route('amber',[[-2.5,23],[-18,23],[-18,27]],.4);arrow('amber',-8,23,-Math.PI/2);arrow('amber',-18,25,0);
  route('ivory',[[3.7,21],[5.2,21],[5.2,11]],.4);arrow('ivory',5.2,14,Math.PI);
  plate('dark',-3.4,28.6,3.4,30.2);plate('mint',-3.4,28.6,-3.1,30.2);plate('mint',3.1,28.6,3.4,30.2);
  plate('dark',1.7,9.9,4.4,11.6);plate('ivory',1.7,9.9,1.95,11.6);
  // Curated signs all face their natural approach; old office sign faced the wrong side.
  sign('RELAY DOCK / CREW DEPARTURES',0,5.45,23.88,22,1.15,Math.PI);
  sign('FLEET OFFICE / CHOOSE A VESSEL',0,2.35,30.12,10,.85,Math.PI);
  sign('BOARDING / SELECTED VESSEL',3,1.9,8.54,5.5,.7,0,'ivory');
  sign('SUPPLIES / FIELD WORKSHOP',-18,2.1,27.1,10,.8,Math.PI,'amber');
  sign('STAY INSIDE THE MARKED LANES',0,11,-7.23,19,.8,0,'amber');
 }else{
  // Archive coronet: forked spine, asymmetric data fins and an octagonal signal aperture.
  box('metal',0,11.35,-20.45,30,1.5,1.3);box('mint',0,10.48,-19.73,30,.12,.08);
  for(const [i,x]of [-13,-9,9,13].entries()){
   const h=i%2?4:6;box('metal',x,12+h/2,-21.6,1.6,h,3);
   box('mint',x,12+h/2,-20.03,.13,h-.7,.05);
   for(let j=0;j<3;j++)box('rust',x,12+j*1.1,-19.98,1.7,.16,.12);
  }
  beam('metal',new THREE.Vector3(-9,13,-20.45),new THREE.Vector3(-3,16,-20.45),.55,.6);
  beam('metal',new THREE.Vector3(9,13,-20.45),new THREE.Vector3(3,16,-20.45),.55,.6);
  ring('metal',0,14.4,-20.35,2.5,.4);ring('mint',0,14.4,-20.3,1.88,.2);
  box('amber',0,14.4,-20.26,.45,.45,.12);
  // Archive Intake: one asymmetric staffed processing machine, no shutter/tentacle presentation.
  // Main delivery tray has exactly the legacy counter floor/top/width; its mint inset is the real drop zone.
  box('intake',0,groundY+.49,-35.8,6.1,.98,1.35);
  box('tray',0,groundY+1.102,-35.8,5,.008,1.12);
  for(const x of [-2.7,2.7])box('mint',x,groundY+1.12,-35.8,.1,.035,1.1);
  for(let i=0;i<9;i++){
   box('intake',-2.3+i*.575,groundY+1.107,-35.8,.08,.015,.96);
   box('amber',-2.3+i*.575,groundY+.65,-35.09,.06,.2,.015);
  }
  box('mint',0,groundY+.87,-35.09,5.5,.045,.025);
  // Closed backboard over the original hatch collider, with routed data channels rather than an aperture.
  box('metal',0,groundY+2.35,-37.42,8,4.7,.32);
  for(const y of [1.45,2.55,3.65]){
   box('dark',-.65,groundY+y,-37.23,6.3,.13,.06);
   box('mint',-2.45,groundY+y,-37.17,.35,.13,.04);
   box('amber',2.15,groundY+y,-37.17,.15,.13,.04);
  }
  // Left-side registration window houses the existing compliance actor, not another NPC subsystem.
  box('metal',-7.2,groundY+1.65,-36.3,.3,3.3,2.4);
  box('dark',-5.2,groundY+1.65,-37.4,4,3.3,.25);
  box('metal',-5.2,groundY+.5,-35.25,3.8,1,.5);
  box('ivory',-5.2,groundY+1.04,-35.25,4,.08,.65);
  box('metal',-3.35,groundY+1.8,-35.35,.16,3.6,.3);
  beam('rust',new THREE.Vector3(-7.2,groundY+3.3,-35.35),new THREE.Vector3(-3.35,groundY+3.9,-35.35),.35,.4);
  box('amber',-5.2,groundY+2.8,-35.09,3.5,.08,.05);
  // Right classification bins are individually notched, with parcel bundles and receipt tags.
  for(const [i,x] of [4.7,6,7.3].entries()){
   box('metal',x,groundY+.62,-36.3,1.1,1.24,1.7);
   box('dark',x,groundY+1.25,-36.3,.84,.025,1.4);
   for(const dx of [-.49,.49])box('rust',x+dx,groundY+1.35,-36.3,.12,.23,1.7);
   box(['mint','amber','plum'][i],x,groundY+.92,-35.42,.72,.18,.025);
   box('ivory',x-.18,groundY+.59,-35.4,.22,.21,.035);
   box('rust',x,groundY+1.41,-36.1,.65,.3,.7);
   box('amber',x,groundY+1.42,-35.74,.1,.29,.02);
  }
  // The hero silhouette is a tilted receipt feed: wide drum, offset arm and a folded paper ribbon.
  beam('intake',new THREE.Vector3(3.8,groundY+1.25,-37.07),new THREE.Vector3(3.1,groundY+3.3,-37.07),.38,.5);
  function drum(key,x,y,z,r=.63,depth=.45){
   for(let i=0;i<10;i++){
    const a=i*Math.PI/5,b=(i+1)*Math.PI/5;
    const p=new THREE.Vector3(x+Math.cos(a)*r,y+Math.sin(a)*r,z),q=new THREE.Vector3(x+Math.cos(b)*r,y+Math.sin(b)*r,z);
    gb.quad(key,p,q,q.clone().add(new THREE.Vector3(0,0,-depth)),p.clone().add(new THREE.Vector3(0,0,-depth)),[[0,0],[1,0],[1,1],[0,1]]);
    const center=new THREE.Vector3(x,y,z+.004);gb.quad(key,center,p,q,q,[[.5,.5],[0,0],[1,0],[1,0]]);
   }
  }
  drum('ivory',3.1,groundY+3.25,-36.52,.53,.45);drum('amber',3.1,groundY+3.25,-36.48,.18,.05);
  const folds=[[groundY+3.16,-36.42],[groundY+2.76,-36.45],[groundY+2.38,-36.68],[groundY+2.05,-36.4],[groundY+1.7,-36.55]];
  for(let i=1;i<folds.length;i++){
   const [y0,z0]=folds[i-1],[y1,z1]=folds[i];
   gb.quad('ivory',new THREE.Vector3(2.75,y1,z1),new THREE.Vector3(3.45,y1,z1),new THREE.Vector3(3.45,y0,z0),new THREE.Vector3(2.75,y0,z0),[[0,0],[1,0],[1,1],[0,1]]);
   for(let j=1;j<5;j++){
    const k=j/5,y=y0+(y1-y0)*k,z=z0+(z1-z0)*k+.012;
    box('dark',3.1,y,z,j%2?.45:.32,.033,.013);
   }
  }
  // A bright suspended ticker identifies the hall without a new point light.
  box('dark',0,groundY+5.7,-23,16,1.3,.25);
  box('mint',0,groundY+4.93,-22.82,16,.1,.05);
  route('mint',[[0,10],[-9.5,10],[-9.5,-12],[0,-12],[0,-33.6]],.36);
  for(const z of [7,-6,-16,-29])arrow('mint',z> -12?-9.5:0,z,Math.PI);
  arrow('mint',-5,10,-Math.PI/2);
  route('amber',[[0,12],[20,12]],.36);arrow('amber',15,12,Math.PI/2);
  route('plum',[[0,14],[-29,14],[-29,-10.2]],.36);arrow('plum',-15,14,-Math.PI/2);arrow('plum',-29,-7,Math.PI);
  plate('dark',-3.2,-34.3,3.2,-33.3);plate('mint',-3.2,-34.3,-2.9,-33.3);plate('mint',2.9,-34.3,3.2,-33.3);
  plate('dark',-31.6,-11.4,-26.4,-10.1);plate('plum',-31.6,-11.4,-31.3,-10.1);
  // Side awning accents are wall-mounted above the preserved cashier/service entrances.
  box('plum',-29,groundY+5.7,-11.68,20,.4,.6);box('amber',29,groundY+5.3,3.26,17,.3,.5);
  sign('ARCHIVE / CONTENT EXCHANGE',0,groundY+10.1,-19.62,27,1.15);
  sign('CONTENT IN / SIGNAL OUT',0,groundY+5.65,-22.8,15,1.05);
  sign('ARCHIVE INTAKE / REGISTER CONTENT',-1.6,groundY+2.25,-37.16,4.3,.55);
  sign('THE HOUSE / CASINO & CHIPS',-29,groundY+4.3,-11.34,19,1.05,0,'plum');
  sign('CREW CONTRACTS',29,groundY+4,3.42,17,1.05,0,'amber');
  sign('SUPPLIES / FIELD WORKSHOP',20,groundY+2.7,11.6,8,.65,0,'amber');
 }
 const materialFor=(key,paint=false)=>{
  const mat=paint?new THREE.MeshBasicMaterial({color:C[key],vertexColors:true}):new THREE.MeshLambertMaterial({color:C[key],vertexColors:true,map:['metal','rust','dark'].includes(key)?levelTexture('metal_dark'):null,emissive:kind==='hub'?0:['mint','amber','plum','intake','tray'].includes(key)?C[key]:0,emissiveIntensity:['intake','tray'].includes(key)?.28:.22});
  if(paint){mat.defines={PSX_NOSNAP:''};mat.polygonOffset=true;mat.polygonOffsetFactor=-8;mat.polygonOffsetUnits=-8;}
  materials.push(mat);return mat;
 };
 root.add(gb.build(key=>materialFor(key)));root.add(floor.build(key=>materialFor(key,true)));
 if(kind==='company'){
  const mat=new THREE.MeshBasicMaterial({color:C.ivory});materials.push(mat);
  receiptTab=new THREE.Mesh(new THREE.PlaneGeometry(.68,.24),mat);receiptTab.position.set(3.1,groundY+1.63,-36.50);root.add(receiptTab);
 }
 // A single 1024x512 atlas batches all map signs into one draw call and updates on language changes.
 let offLang=()=>{};
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');
  if(ctx){
   const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;
   const mat=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});mat.defines={PSX_NOSNAP:''};materials.push(mat);
   const positions=[],uv=[],indices=[];
   signs.forEach((s,i)=>{
    const cx=(i%2)*512,cy=Math.floor(i/2)*128,base=positions.length/3;
    for(const [dx,dy]of [[-s.w/2,-s.h/2],[s.w/2,-s.h/2],[s.w/2,s.h/2],[-s.w/2,s.h/2]])positions.push(s.x+dx*Math.cos(s.yaw),s.y+dy,s.z-dx*Math.sin(s.yaw));
    const u0=(cx+3)/1024,u1=(cx+509)/1024,v0=1-(cy+125)/512,v1=1-(cy+3)/512;
    uv.push(u0,v0,u1,v0,u1,v1,u0,v1);indices.push(base,base+1,base+2,base,base+2,base+3);
   });
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();root.add(new THREE.Mesh(geometry,mat));
   const draw=()=>{ctx.fillStyle='#13252d';ctx.fillRect(0,0,1024,512);signs.forEach((s,i)=>{const x=(i%2)*512,y=Math.floor(i/2)*128;ctx.fillStyle='#13252d';ctx.fillRect(x+2,y+2,508,124);ctx.strokeStyle='#'+C[s.color].toString(16).padStart(6,'0');ctx.lineWidth=5;ctx.strokeRect(x+5,y+5,502,118);ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 31px sans-serif';ctx.textAlign='center';ctx.fillText(t(s.key),x+256,y+77,474);});tex.needsUpdate=true;};draw();offLang=onLangChange(draw);
  }
 }
 return {root,signs,update(dt,pending=false){
  if(!receiptTab)return;receiptTime+=Math.max(0,Math.min(.1,dt));
  receiptTab.position.y=groundY+1.63+(pending?Math.sin(receiptTime*9)*.12:Math.sin(receiptTime*1.7)*.018);
  receiptTab.rotation.z=pending?Math.sin(receiptTime*7)*.035:0;
  receiptTab.material.color.setHex(pending?C.amber:C.ivory);
 },dispose(){offLang();root.traverse(o=>{o.geometry?.dispose();});for(const mat of materials){if(mat.map?.isCanvasTexture)mat.map.dispose();mat.dispose();}root.removeFromParent();}};
}
