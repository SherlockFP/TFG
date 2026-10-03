import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createItemModel} from '../../src/models/items.js';
import {itemDef} from '../../src/game/items.js';
import {itemGeom,fitGrip,PALM,ikPose} from '../../src/game/fpbody_grip.js';
for(const id of ['shotgun','harpoon']){
 const inner=createItemModel(id),root=new THREE.Group();root.add(inner);
 const c=new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());inner.position.sub(c);root.userData.gripOffset=c;
 const geom=itemGeom(root),fit=fitGrip(geom,itemDef(id),id);
 const anchor=geom.origin.clone().applyQuaternion(fit.quat).add(fit.pos);
 assert(anchor.distanceTo(PALM)<.001,id+' authored handle must remain at right palm rather than being pushed off the hand');
 assert(fit.grip.L&&fit.box.distanceToPoint(fit.grip.L)<.06,id+' support hand must touch actual weapon geometry');
 assert(fit.grip.R&&ikPose(1,fit.grip.R).hand.distanceTo(fit.grip.R)<.035,id+' right hand target must be reachable by native arm rig');
 assert(ikPose(-1,fit.grip.L).hand.distanceTo(fit.grip.L)<.035,id+' left support target must be reachable by native arm rig');
 assert(fit.box.max.z<-.08,id+' must remain ahead of camera');
}
console.log('firearm38: native firearm handles anchored and left support contact passed');
