import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Original faceted maintenance cart/escort. Three bounded matte batches, no lights. */
export function makeEndless41Robot(kind){
 const root=new THREE.Group(),carry=new THREE.Group();carry.position.set(0,.66,0);root.add(carry);
 const colors=[0x31383c,0xaaa391,0x9c8151],materials=colors.map(color=>new THREE.MeshLambertMaterial({color,flatShading:true})),parts=colors.map(()=>[]);
 const box=(w,h,d,x,y,z,mat=0)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts[mat].push(g);};
 box(.64,.22,.62,0,.38,0);box(.54,.14,.52,0,.56,0,1);
 for(const x of [-.29,.29])for(const z of [-.24,.24]){const g=new THREE.CylinderGeometry(.18,.18,.09,6);g.rotateZ(Math.PI/2);g.translate(x,.19,z);parts[0].push(g);}
 if(kind==='hauler'){for(const x of [-.29,.29])box(.045,.2,.58,x,.65,0,1);for(const z of [-.27,.27])box(.54,.13,.04,0,.61,z,1);box(.12,.035,.25,0,.6,-.12,2);}
 else{box(.35,.32,.28,0,.8,0,1);box(.28,.075,.035,0,.86,-.155);box(.12,.11,.23,0,.61,-.25,2);box(.045,.19,.05,.15,.95,.03,2);}
 const geometries=[];for(let i=0;i<parts.length;i++){const g=mergeGeometries(parts[i],false);parts[i].forEach(p=>p.dispose());if(g){geometries.push(g);root.add(new THREE.Mesh(g,materials[i]));}}
 let disposed=false;return{root,carry,dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
