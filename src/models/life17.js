import * as THREE from 'three';
import { getMaterial } from '../render/textures.js';
// The native item owner disposes geometry; cached render materials remain shared.
export function createParcel17(){
 const root=new THREE.Group();
 const add=(w,h,d,color,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),getMaterial('plastic',color));m.position.set(x,y,z);root.add(m);};
 add(.46,.28,.32,0x426a66);add(.08,.29,.33,0xd4c398);add(.47,.04,.33,0xd4c398);add(.14,.09,.012,0x83ddc8,.11,.05,.168);
 return root;
}
export function courierMarker17(recipient=false){
 const root=new THREE.Group(),geo=new THREE.OctahedronGeometry(.16,0),mat=new THREE.MeshBasicMaterial({color:recipient?0xd8ad67:0x83ddc8});
 const mesh=new THREE.Mesh(geo,mat);mesh.position.y=2.55;root.add(mesh);
 return {root,dispose(){geo.dispose();mat.dispose();root.removeFromParent();}};
}
