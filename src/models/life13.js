import * as THREE from 'three';
import { parts18 } from './life18_shapes.js';
// Neutral workers have a compact private rig; their native routes/interaction IDs are unchanged.
export function createCitizen13(kind=0){
 const root=new THREE.Group();root.name='alien-citizen13';
 const style=kind%3,materials={
  cloth:new THREE.MeshLambertMaterial({color:[0xaa9371,0xaaa79a,0x747d8b][style]}),
  dark:new THREE.MeshLambertMaterial({color:0x34363a}),
  shell:new THREE.MeshLambertMaterial({color:[0xc4bba6,0xb0aea4,0xa1a7ad][style]}),
  glove:new THREE.MeshLambertMaterial({color:0xd0c6b0}),
  screen:new THREE.MeshLambertMaterial({color:0x111519,emissive:0x211b10,emissiveIntensity:.035}),
  pixel:new THREE.MeshLambertMaterial({color:0xc9ba91,emissive:0xad8044,emissiveIntensity:.06}),
 };
 // Separate jacket/trouser/pocket values survive ordinary exposure without adding mesh batches.
 materials.trouser=new THREE.MeshLambertMaterial({color:[0x929386,0x7b8289,0xa2a097][style]});
 materials.pocket=new THREE.MeshLambertMaterial({color:materials.cloth.color.clone().multiplyScalar(.84)});
 for(const key of ['cloth','trouser','pocket','shell'])materials[key].userData.wear18=true;
 materials.vertex=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
 for(const material of Object.values(materials))material.flatShading=true;
 const rig=new THREE.Group();root.add(rig);
 const pivot=(name,x,y,z=0)=>{const g=new THREE.Group();g.name=name;g.position.set(x,y,z);rig.add(g);return g;};
 const torso=pivot('worker-jacket',0,.94),body=parts18(torso,materials);
 body.box('cloth',.58,.62,.37,0,.13,0);
 body.box('trouser',.47,.3,.32,0,-.26,0);
 body.box('dark',.6,.075,.39,0,-.1,.005); // utility belt
 body.box('shell',.09,.07,.035,0,-.1,.219);
 // Jacket placket, chest pockets, shoulders and overall suspenders.
 body.box('dark',.027,.43,.015,0,.2,.197);
 for(const x of [-.18,.18]){
  body.box('shell',.055,.43,.025,x,.19,.193);
  body.box('pocket',.15,.14,.04,x,.16,.219);
  body.box('glove',.075,.025,.015,x,.23,.247);
 }
 body.box('dark',.32,.43,.18,0,.13,-.265); // small battery/survey pack
 body.box('shell',.26,.055,.19,0,.36,-.268);
 body.box('screen',.14,.07,.016,0,.23,-.365);
 // Dispatcher folio, receiver pouch or field scanner gives each citizen a practical silhouette.
 if(kind%2===0){body.box('shell',.19,.23,.14,.33,-.12,.04);body.box('dark',.2,.035,.15,.33,.015,.04);}
 else{body.box('dark',.12,.24,.08,-.32,-.04,.06);body.box('screen',.095,.095,.02,-.32,.0,.111);}
 body.finish();
 const head=pivot('alien-terminal-head',0,1.57),face=parts18(head,materials);
 face.box('dark',.18,.15,.19,0,-.25,0); // collar/neck
 if(style===0){
  // Broad tapered terminal, recessed square display and headphone housings.
  face.box('shell',.58,.43,.38,0,.015,-.015);
  face.box('dark',.49,.33,.035,0,.02,.187);
  face.box('screen',.405,.235,.018,0,.035,.211);
  for(const x of [-.3,.3])face.box('dark',.085,.22,.23,x,.0,-.02);
  face.box('shell',.045,.18,.045,.18,.3,-.09);
  for(const x of [-.105,.105])face.box('pixel',.055,.055,.012,x,.055,.225);
  face.box('pixel',.115,.019,.012,0,-.03,.225);
 }else if(style===1){
  // Tall archive reader with twin offset optical panes and a heavy brow.
  face.box('shell',.4,.52,.37,0,.045,0);
  face.box('dark',.37,.37,.04,0,.06,.194);
  face.box('screen',.14,.27,.02,-.09,.075,.22);
  face.box('screen',.14,.18,.02,.09,.03,.22);
  face.box('shell',.46,.09,.41,0,.305,.005);
  for(const x of [-.09,.09])face.box('pixel',.04,.075,.012,x,.1,.235);
  face.box('dark',.13,.13,.045,0,-.16,.215);
 }else{
  // Domed wraparound visor; side breathing valves distinguish it from a CRT box.
  face.add('shell',new THREE.SphereGeometry(.285,10,6),0,.035,-.015);
  face.box('dark',.54,.22,.12,0,.035,.18);
  face.box('screen',.46,.155,.06,0,.047,.247);
  for(const x of [-.26,.26])face.add('dark',new THREE.CylinderGeometry(.08,.08,.1,6),x,-.11,.12,0,0,Math.PI/2);
  for(const x of [-.095,.095])face.box('pixel',.045,.055,.012,x,.057,.283);
  face.box('shell',.13,.1,.1,0,-.19,.185);
 }
 face.finish();
 const legs=[],arms=[];
 for(const sign of [-1,1]){
  const leg=pivot(sign<0?'left-leg':'right-leg',sign*.15,.65),p=parts18(leg,materials);
  p.box('trouser',.225,.43,.245,0,-.19,0);
  p.box('dark',.24,.13,.25,0,-.34,.0); // articulated knee/boot gaiter
  p.box('dark',.26,.17,.37,0,-.545,.06);
  p.box('shell',.23,.055,.12,0,-.53,.205); // reinforced toe
  p.finish();legs.push(leg);
  const arm=pivot(sign<0?'left-arm':'right-arm',sign*.34,1.24),q=parts18(arm,materials);
  q.box('cloth',.19,.38,.215,sign*.015,-.14,0);
  q.box('dark',.2,.065,.22,sign*.015,-.3,.005);
  q.box('glove',.19,.16,.19,sign*.015,-.405,.012);
  q.box('glove',.07,.085,.11,-sign*.07,-.365,.077); // opposed thumb
  q.finish();arms.push(arm);
 }
 let gait=0;let disposed=false;
 return {root,update(dt,time,moving,near){
  if(disposed)return;const target=moving&&!near?1:0;gait+=(target-gait)*Math.min(1,Math.max(0,dt)*8);
  const swing=Math.sin(time*4.4)*.3*gait;
  legs[0].rotation.x=swing;legs[1].rotation.x=-swing;
  arms[0].rotation.x=-swing*.7;arms[1].rotation.x=swing*.7;
  arms[0].rotation.z=.065;arms[1].rotation.z=-.065;
  rig.position.y=Math.abs(Math.sin(time*4.4))*.025*gait+Math.sin(time*1.8)*.004;
  torso.rotation.z=Math.sin(time*4.4)*.025*gait;
  head.rotation.y=near?Math.sin(time*.8)*.05:0;
  head.rotation.x=near?-.03:Math.sin(time*1.8)*.009;
 },dispose(){if(disposed)return;disposed=true;rig.traverse(o=>o.geometry?.dispose());for(const m of Object.values(materials))m.dispose();root.removeFromParent();}};
}
