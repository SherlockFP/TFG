import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
// A working transfer port: structural ribs, suspended cable spools and inhabited service frontage.
// All geometry is authored once and merged into two material buckets. No light or frame update.
const PALETTE={shell:0x505653,shadow:0x252726,mint:0x858477,amber:0x967d54,ivory:0xb7b3a6};
export function buildDock18(parent,box){
 const gb=new GeoBuilder();let pieces=0;
 const rgb=k=>{const c=new THREE.Color(PALETTE[k]);return [c.r,c.g,c.b];};
 const visual=(k,x,y,z,w,h,d)=>{gb.box(k==='mint'||k==='amber'?'accent':'shell',x,y,z,w,h,d,.3,rgb(k));pieces++;};
 const solid=(k,x,y,z,w,h,d)=>{visual(k,x,y,z,w,h,d);box('metal_dark',x,y,z,w,h,d,0,true);};
 // Real accessible service apron is framed by side cages, never occupied by cargo stacks.
 // Feet are outside the complete modular vessel envelope and the south citizen loops.
 for(const side of [-1,1]){
  const x=side*29;
  for(const z of [-18,0,17]){
   solid('shell',x,4.9,z,1.2,12.3,1.3);
   solid('shell',side*25.5,10.9,z,7.8,.9,1.1);
   solid('shell',side*21,14.1,z,3.5,7.4,1.1);
   solid('shell',side*14,18,z,14.8,.9,1.1);
   visual('mint',side*25.5,11.42,z,7.4,.1,1.12);
   visual('amber',side*29,1.25,z+.68,1.25,.13,.025);
  }
  // Elevated transfer deck between the ribs; underside clears walking capsules by five metres.
  solid('shell',x,5.25,-.5,6,.3,38);
  solid('shell',side*32,6.1,-.5,.14,1.4,38);
  visual('amber',side*32.1,6.8,-.5,.05,.08,38);
  for(const z of [-15,-11,-7,-3,1,5,9,13])visual('shadow',x,5.42,z,5.2,.04,.08);
 }
 // High transfer spine and trolley: lowest cross-vessel structure is 17.55m.
 solid('shell',0,18,-18,57,.9,1.1);
 visual('mint',0,18.5,-17.5,56,.08,.04);
 for(const x of [-18,-6,6,18]){visual('amber',x,18.5,-17.48,.35,.22,.04);}
 // Suspended empty intake cradles communicate cargo transfer rather than generic warehouse boxes.
 for(const z of [-10,8]){
  const x=-29;
  for(const dx of [-2,2])visual('shadow',x+dx,8.3,z,.07,5.8,.07);
  visual('shell',x,5.9,z,5,.2,4);visual('mint',x,6.02,z+2.02,4.4,.08,.04);
  for(const dx of [-2.2,2.2])visual('shell',x+dx,6.6,z,.18,1.3,4.2);
 }
 // Two open-sided cable spools sit above the east service deck, not in the walking lane.
 for(const z of [-9,9]){
  const x=29,cy=8.1;
  for(let i=0;i<12;i++){
   const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
   for(const face of [-1,1]){
    const zz=z+face*.95;
    const verts=[new THREE.Vector3(x+Math.cos(a)*2.25,cy+Math.sin(a)*2.25,zz),new THREE.Vector3(x+Math.cos(b)*2.25,cy+Math.sin(b)*2.25,zz),new THREE.Vector3(x+Math.cos(b)*1.7,cy+Math.sin(b)*1.7,zz),new THREE.Vector3(x+Math.cos(a)*1.7,cy+Math.sin(a)*1.7,zz)];
    gb.quad('accent',...(face>0?verts:verts.reverse()),[[0,0],[1,0],[1,1],[0,1]],rgb('amber'));
   }
  }
  visual('shadow',x,cy,z,1.9,1.9,2.1);visual('shell',x,cy,z,3.2,.28,2.05);
 }
 // Inhabited cargo market frontage around the existing staffed industry vendor.
 // Front at z31 is entirely open; counter/pickup/spare robot remains owned by industry13.
 solid('shell',-22.7,1.05,28,.3,4.6,5.6);solid('shell',-13.4,1.05,27,.3,4.6,3.6);
 solid('shadow',-21.5,1.35,25.2,2.4,5.2,.4);solid('shadow',-14.5,1.35,25.2,2.4,5.2,.4);
 solid('shell',-18,3.55,27.1,9.9,.35,5.3);
 visual('amber',-18,3.77,29.76,9.7,.1,.08);
 for(const x of [-21,-19.5,-18,-16.5,-15])visual('ivory',x,3.8,28.1,.7,.04,3.1);
 // Repair trays, old packet spools and lockout tags are curated behind the clerk, not scattered outside.
 for(const x of [-21.2,-14.7]){visual('shell',x,.2,25.7,1.3,2.4,.55);for(const y of [-.5,.3,1.1]){visual('ivory',x,y,26,1.1,.06,.6);visual('amber',x+.35,y+.15,26.3,.08,.18,.025);}}
 visual('mint',-18,1.7,25.44,4.6,.12,.04);
 // A relief shift nook at the rear of the dispatch hall: bench and route trays, outside citizen paths.
 for(const x of [-10,10]){
  solid('shell',x,-.5,35.5,3.4,.45,.85);
  solid('shadow',x,.1,36,3.4,1.3,.16);
  visual('mint',x,1.1,36.62,2.6,.08,.04);
  visual('ivory',x-.6,-.23,35.5,.5,.05,.4);
 }
 const group=gb.build(k=>levelMaterial(null,{vertexColors:true,emissive:0}));group.name='dock18-transfer-port';parent.add(group);
 return {group,metrics:{pieces,drawMeshes:group.children.length,lights:0,updates:0}};
}
