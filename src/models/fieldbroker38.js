import * as THREE from 'three';
// Cast service counter and repair station; visible solids own matching native bodies.
export function buildFieldBroker38(root,physics){
 const colliders=[];
 const box=(x,y,z,w,h,d,color,solid=false)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color,flatShading:true}));
  mesh.position.set(x,y,z);mesh.userData.i13owned=true;root.add(mesh);
  if(solid&&physics){const p=root.position;colliders.push(physics.addStaticBox(p.x+x,p.y+y,p.z+z,w/2,h/2,d/2));}
 };
 box(0,-.08,0,5,.16,3.8,0x343638);
 box(0,.55,0,3.4,1.1,.8,0x55575a,true);
 box(0,1.13,0,3.7,.08,1,0xb8af98,true);
 box(0,.15,.425,3.2,.16,.06,0x292b2e);
 for(const x of [-2.2,2.2]){box(x,1.3,-.8,.16,2.6,.16,0x45484c,true);box(x,.8,-.8,.26,.08,.3,0xa58c57);}
 box(0,2.7,-.8,5,.2,2.7,0x6b6e70,true);
 box(0,1.05,-1.5,3.6,1.4,.25,0x41454a,true);
 for(const x of [-1.15,0,1.15]){
  box(x,.45,-1.28,.94,.75,.25,0x636568);
  for(const y of [.32,.59])box(x,y,-1.13,.3,.035,.035,0xb8af98);
  box(x,1.42,-1.31,.12,.48,.06,0xaaa592);box(x+.22,1.5,-1.31,.06,.6,.06,0x88898a);
 }
 box(-1.5,1.27,-.23,.45,.19,.35,0x2c3035);
 box(-1.5,1.37,-.05,.27,.035,.015,0x9e8652);
 box(2.8,.45,-.8,.8,.1,1,0x62656a,true);
 for(const dx of [-.4,.4])box(2.8+dx,.25,-.8,.14,.5,.12,0x3f444a,true);
 let disposed=false;
 return {dispose(){if(disposed)return;disposed=true;for(const c of colliders)physics.removeCollider(c);}};
}
