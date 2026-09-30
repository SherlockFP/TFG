import * as THREE from 'three';
// Neutral life uses its own bounded geometry/materials, no lights or creature combat registration.
export function createCitizen13(kind=0) {
 const root=new THREE.Group();root.name='alien-citizen13';const meshes=[];
 const colors=[0x88cfc1,0xc59dc8,0xc7b277],body=new THREE.MeshLambertMaterial({color:colors[kind%3]}),dark=new THREE.MeshLambertMaterial({color:0x243d4b}),eye=new THREE.MeshBasicMaterial({color:0xcaf5e5});
 const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);root.add(m);meshes.push(m);return m;};
 const legs=[];let head;
 if(kind%3===0){
  add(new THREE.ConeGeometry(.6,1.1,5),body,0,1.05,0);head=add(new THREE.OctahedronGeometry(.38,0),body,0,1.85,0);
  for(const x of [-.7,.7]){const wing=add(new THREE.BoxGeometry(.95,.09,.45),dark,x,1.45,0);wing.rotation.z=x<0?-.3:.3;legs.push(wing);}
  add(new THREE.BoxGeometry(.48,.10,.04),eye,0,1.91,.32);
 }else if(kind%3===1){
  add(new THREE.SphereGeometry(.58,6,4),body,0,1.25,0);head=add(new THREE.CylinderGeometry(.26,.35,.7,5),dark,0,1.82,0);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,leg=add(new THREE.CylinderGeometry(.075,.055,1.1,4),body,Math.sin(a)*.38,.55,Math.cos(a)*.38);leg.rotation.z=Math.sin(a)*.35;legs.push(leg);}
  for(const x of [-.15,.15])add(new THREE.SphereGeometry(.09,4,3),eye,x,2.13,.25);
 }else{
  add(new THREE.OctahedronGeometry(.78,0),body,0,.95,0);head=add(new THREE.SphereGeometry(.3,5,3),dark,0,1.72,.12);
  for(const x of [-.42,.42])legs.push(add(new THREE.BoxGeometry(.24,.5,.35),dark,x,.25,.08));
  for(const x of [-.18,.18])add(new THREE.BoxGeometry(.06,.13,.06),eye,x,1.76,.38);
  for(const x of [-.48,.48])add(new THREE.ConeGeometry(.13,.5,4),body,x,1.75,-.1);
 }
 const headY=head.position.y;
 const base=legs.map(l=>({y:l.position.y,z:l.rotation.z}));
 return {root,update(dt,time,moving,near){head.position.y=headY+Math.sin(time*2)*.007;for(let i=0;i<legs.length;i++){legs[i].rotation.z=base[i].z+(moving?Math.sin(time*5+i*Math.PI)*.14:Math.sin(time*2+i)*.025);legs[i].position.y=base[i].y+(kind%3===0?Math.sin(time*2+i)*.05:0);}root.scale.y=1+Math.sin(time*2)*.01;if(near)head.rotation.y=Math.sin(time)*.1;},dispose(){for(const mesh of meshes)mesh.geometry.dispose();body.dispose();dark.dispose();eye.dispose();root.removeFromParent();}};
}
