import * as THREE from 'three';
export function buildHazards38(parent,ceiling,voidSpot){
 const group=new THREE.Group();group.name='hazards38';parent.add(group);
 const mesh=(geo,color,pos)=>{const m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color,flatShading:true,side:THREE.DoubleSide}));m.position.copy(pos);group.add(m);return m;};
 let tongue=null,ring=null,disk=null;
 if(ceiling){mesh(new THREE.IcosahedronGeometry(.42,0),0x66594d,new THREE.Vector3(ceiling.x,ceiling.top-.3,ceiling.z));tongue=mesh(new THREE.CylinderGeometry(.035,.045,ceiling.top-ceiling.y-.4,5),0x9a7662,new THREE.Vector3(ceiling.x,(ceiling.top+ceiling.y)/2,ceiling.z));mesh(new THREE.TorusGeometry(.19,.07,4,7),0x393c3c,new THREE.Vector3(ceiling.x,ceiling.top-.6,ceiling.z)).rotation.x=Math.PI/2;}
 if(voidSpot){ring=mesh(new THREE.TorusGeometry(.9,.06,4,16),0x9183a0,new THREE.Vector3(voidSpot.x,voidSpot.y+.08,voidSpot.z));ring.rotation.x=Math.PI/2;disk=mesh(new THREE.CircleGeometry(.85,16),0x17161e,new THREE.Vector3(voidSpot.x,voidSpot.y+.05,voidSpot.z));disk.rotation.x=-Math.PI/2;ring.visible=disk.visible=false;}
 let disposed=false;
 return {group,update(time,stage){if(tongue)tongue.rotation.z=Math.sin(time*1.7)*.02;if(ring){ring.visible=disk.visible=stage==='warning'||stage==='active';ring.scale.setScalar(stage==='active'?1.3:1+.08*Math.sin(time*6));}},dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}
