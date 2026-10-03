import * as THREE from 'three';
export function createCompanyClaw38(company){
 const zone=company.interactables.find(i=>i.type==='sellzone'),root=new THREE.Group();root.name='companyclaw38';root.position.copy(zone.pos);company.group.add(root);
 const parts=[];
 const box=(w,h,d,x,y,z,color)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color,flatShading:true}));mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 const wrist=box(.8,.45,.55,0,.18,-1.2,0x424647);
 for(const [i,x]of [-.33,-.11,.11,.33].entries()){const finger=new THREE.Group();finger.position.set(x,.18,-.8);root.add(finger);const bone=new THREE.Mesh(new THREE.BoxGeometry(.13,.19,.55),new THREE.MeshLambertMaterial({color:0x777268,flatShading:true}));bone.position.z=.25;finger.add(bone);const nail=new THREE.Mesh(new THREE.ConeGeometry(.085,.3,4),new THREE.MeshLambertMaterial({color:0xb3aa96,flatShading:true}));nail.rotation.x=Math.PI/2;nail.position.set(0,-.08,.64);finger.add(nail);parts.push(finger);}
 root.visible=false;let disposed=false;
 return {root,update(time,stage){if(disposed)return;root.visible=stage==='windup'||stage==='strike';const strike=stage==='strike';wrist.position.z=strike?-.25:-1.2;for(const [i,p]of parts.entries()){p.position.z=strike?.15:-.8;p.rotation.x=strike?.35:Math.sin(time*12+i)*.045;}},dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}
