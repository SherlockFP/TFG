import * as THREE from 'three';
export function makeTrolley(){const root=new THREE.Group(),wheels=[];
 const dark=new THREE.MeshStandardMaterial({color:0x30383f,roughness:.85}),steel=new THREE.MeshStandardMaterial({color:0x8a9094,roughness:.6}),yellow=new THREE.MeshStandardMaterial({color:0xc4a844,roughness:.85});
 const box=(x,y,z,a,b,c,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(a,b,c),mat);m.position.set(x,y,z);root.add(m);return m;};
 box(0,.5,0,1.2,.12,1.7,dark);for(const x of [-.6,.6]){box(x,.9,0,.08,.8,1.7,steel);for(const z of [-.78,0,.78])box(x,1.2,z,.1,.15,.14,yellow);}
 for(const z of [-.85,.85])box(0,.82,z,1.2,.65,.08,steel);
 for(const x of [-.5,.5])box(x,1.1,1.25,.06,.7,.06,steel);box(0,1.45,1.25,1.1,.08,.08,yellow);
 for(const x of [-.5,.5])for(const z of [-.58,.58]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.12,10),dark);m.rotation.z=Math.PI/2;m.position.set(x,.23,z);root.add(m);wheels.push(m);}
 return {root,wheels,dispose(){root.removeFromParent();root.traverse(o=>o.geometry?.dispose());dark.dispose();steel.dispose();yellow.dispose();}};
}
