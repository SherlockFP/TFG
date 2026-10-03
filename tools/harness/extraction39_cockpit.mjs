// Labelled admission setup for lifecycle suites whose other world systems are
// doubles. Lever floor/range/LOS still query a real built ship in native Rapier.
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {buildShip,insideShip} from '../../src/world/ship.js';
export async function nativeCockpit39(){
 await initPhysics();
 const physics=new Physics(),scene=new THREE.Scene(),ship=buildShip({physics,scene,lightPool:{add:x=>x}});
 physics.step(1/30);
 const player=()=>({pos:new THREE.Vector3(-5.25,.05,.9),dead:false,downed:false,hp:100,get inShip(){return insideShip(this.pos);},eyePos(){return this.pos.clone().add(new THREE.Vector3(0,1.62,0));}});
 return {physics,scene,ship,player,dispose(){const owned=new Set();scene.traverse(o=>{if(o.geometry)owned.add(o.geometry);for(const m of [].concat(o.material||[]))owned.add(m);});owned.forEach(o=>o.dispose?.());physics.dispose();}};
}
