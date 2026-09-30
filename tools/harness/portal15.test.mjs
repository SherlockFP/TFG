// Real generated portal panels and the actual interaction/LOS selector.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c);}"));
import assert from 'node:assert/strict';
import * as THREE from 'three';
const canvas = () => ({width:0,height:0,style:{},getContext:()=>new Proxy({}, {get:(_,k)=>k==='measureText'?()=>({width:10}):['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):['getImageData','createImageData'].includes(k)?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true})});
globalThis.window=globalThis;globalThis.document={createElement:canvas,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,head:{appendChild(){}},body:{appendChild(){}},addEventListener(){}};
globalThis.localStorage={getItem:()=>null};
const {initPhysics,Physics,G}=await import('../../src/physics/physics.js');
const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
const {actionMethods}=await import('../../src/game/actions.js');
await initPhysics();
let checked=0,baselineBlocked=0;
for(const seed of [150006924,1235]){
 const physics=new Physics(),facility=buildFacility(generateLayout(seed,'factory',.8),{physics,lightPool:{add:x=>x,remove(){}}});physics.world.step();
 const camera=new THREE.PerspectiveCamera(72,16/9,.05,420),player={pos:new THREE.Vector3(),indoor:true,inShip:false,heldItem:()=>null};
 let used=null;
 const game={physics,camera,player,run:{phase:'moon'},ship:{points:{}},world:{facility},items:{get:()=>null},creatures:{views:new Map()},mods:{emit(){}},
  useExit(index,inside){used={index,inside};},interactablesNow(){return actionMethods.interactablesNow.call(this);}};
 for(const door of facility.doors.filter(d=>d.teleport))for(const offset of [-.25,0,.25])for(const height of [.98,1.62]){
  player.pos.copy(door.spawn);player.pos.x+=offset;
  camera.position.copy(player.pos).add(new THREE.Vector3(0,height,0));
  // Some rooms have several fire exits: aim at this portal's nearest target.
  const points=game.interactablesNow().filter(ip=>/^(Exit facility|Use fire exit)/.test(ip.label||''));
  const target=points.sort((a,b)=>a.pos.distanceToSquared(door.pos)-b.pos.distanceToSquared(door.pos))[0].pos;
  camera.lookAt(target);camera.updateMatrixWorld(true);
  const found=actionMethods.findInteraction.call(game);assert.ok(found&&/^(Exit facility|Use fire exit)/.test(found.label),`portal seed${seed} offset${offset} eye${height} must be usable at its centre`);
  found.action();assert.deepEqual(used,{index:door.exitIndex,inside:false});checked++;
  const oldTarget=door.pos.clone().add(new THREE.Vector3(0,1.3,0));camera.lookAt(oldTarget);camera.updateMatrixWorld(true);
  const oldGame={...game,interactablesNow:()=>[{pos:oldTarget,r:1.2,reach:2.4,label:'Old exit centre',action(){}}]};
  if(!actionMethods.findInteraction.call(oldGame))baselineBlocked++;
  // A separate physical wall still blocks this interaction; no noLos exemption.
  const halfway=camera.position.clone().lerp(target,.5),wall=physics.addStaticBox(halfway.x,halfway.y,halfway.z,.8,.8,.2,0,G.STATIC,{kind:'portal-test-wall'});physics.world.step();
  camera.lookAt(target);camera.updateMatrixWorld(true);assert.equal(actionMethods.findInteraction.call(game),null,'unrelated intervening walls retain strict LOS');
  physics.removeCollider(wall);physics.world.step();
 }
 facility.dispose(physics);physics.world.free();
}
assert.ok(baselineBlocked>0,'negative control reproduces the old angled portal occlusion');
console.log(`portal15: ${checked} real generated portal/stance approaches pass; old centre blocked ${baselineBlocked}; unrelated walls still block`);
