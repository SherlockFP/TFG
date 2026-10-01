import * as THREE from 'three';
import { getMaterial } from '../render/textures.js';
import { parts18 } from './life18_shapes.js';
// Native item owner disposes private geometry; render cache owns these materials.
export function createParcel17(){
 const root=new THREE.Group(),p=parts18(root,{
  body:getMaterial(null,0x979184,{flat:true}),trim:getMaterial(null,0x36383c,{flat:true}),seal:getMaterial(null,0xcbbb9b,{flat:true}),tag:getMaterial(null,0xd4cdbd,{flat:true}),
 });
 p.box('body',.46,.28,.32);p.box('trim',.465,.055,.325,0,.07,0);
 p.box('seal',.075,.29,.33);p.box('seal',.47,.035,.33,0,-.065,0);
 p.box('tag',.14,.075,.013,.125,.015,.167);
 for(const x of [-.185,.185])p.box('trim',.035,.1,.03,x,.0,.172);
 p.box('trim',.19,.035,.1,0,.158,0);p.finish();return root;
}
export function courierMarker17(recipient=false){
 const root=new THREE.Group();root.name=recipient?'courier-recipient-placard':'courier-dispatch-placard';
 const materials={edge:new THREE.MeshLambertMaterial({color:0x36383c}),face:new THREE.MeshLambertMaterial({color:recipient?0xb89a68:0xc0b9a5,emissive:recipient?0x70582c:0x6c6553,emissiveIntensity:.045}),ink:new THREE.MeshLambertMaterial({color:0x343536})};
 for(const material of Object.values(materials))material.flatShading=true;
 const p=parts18(root,materials);
 // Envelope/receipt icon is readable from front and back, and replaces the floating toy crystal.
 p.box('edge',.32,.23,.065,0,2.22,0);p.box('face',.28,.19,.07,0,2.22,0);
 for(const z of [-.04,.04]){
  p.box('ink',.21,.025,.009,0,2.19,z);
  p.box('ink',.11,.018,.009,-.046,2.25,z,0,0,-.45);
  p.box('ink',.11,.018,.009,.046,2.25,z,0,0,.45);
 }
 p.finish();let disposed=false;
 return {root,dispose(){if(disposed)return;disposed=true;root.traverse(o=>o.geometry?.dispose());for(const mat of Object.values(materials))mat.dispose();root.removeFromParent();}};
}
