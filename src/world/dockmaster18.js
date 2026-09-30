import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { extInstance } from './extmodels.js';
import { createAvatar2 } from '../models/avatar2.js';
// External model templates stay cache-owned. This map owns the clone's geometry/materials.
export function createDockmaster18(){
 const root=extInstance('tfg_dockmaster18');
 if(root){root.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});root.name='dockmaster18-service';root.userData.assetReady=true;return root;}
 const fallback=new THREE.Group();fallback.name='dockmaster18-service';fallback.userData.assetReady=false;
 const mats={shell:new THREE.MeshLambertMaterial({color:0x505653,flatShading:true}),mint:new THREE.MeshLambertMaterial({color:0x858477,flatShading:true}),ivory:new THREE.MeshLambertMaterial({color:0xb7b3a6,flatShading:true})};
 const rounded=(x,y,z,w,h,d,key,r=.12)=>{const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,r),mats[key]);m.position.set(x,y,z);fallback.add(m);};
 rounded(0,.58,0,5.9,1.12,1.27,'shell');rounded(0,1.2,0,6.15,.15,1.5,'ivory',.06);rounded(0,.64,-.68,4.9,.48,.08,'mint',.025);
 const avatar=createAvatar2({suitColor:'#837761'});avatar.root.position.set(0,0,1);avatar.root.rotation.y=Math.PI;avatar.update?.(0,{state:'idle',speed:0});avatar.root.name='dockmaster18_actor';fallback.add(avatar.root);
 for(const x of [-11.8,11.8])rounded(x,3.15,-6.55,1.35,7.5,.9,'shell',.2);
 rounded(0,5.45,-6.6,24.8,1.4,1.03,'shell',.25);
 return fallback;
}
