import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {initPhysics,Physics} from '../../src/physics/physics.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {installThreats13} from '../../src/game/threats13.js';
await initPhysics();
const previous=globalThis.document;
const canvas=()=>({width:64,height:64,style:{},getContext:()=>new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:10}):(k==='createImageData'||k==='getImageData')?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true})});
globalThis.document={createElement:()=>canvas()};
const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
try{
 for(const type of ['c13_printer','c13_checksum']){
  const physics=new Physics(),scene=new THREE.Scene(),layout=generateLayout(1235,'factory',.8);
  const fac=buildFacility(layout,{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);
  const rooms=layout.rooms.filter(r=>r.type!=='entrance');let hits=0;
  const p={id:'crew',zone:'in',dead:false,downed:false,inShip:false,noise:1,voice:0,pos:new THREE.Vector3(),eye:new THREE.Vector3()};
  const game={isHost:true,scene,engine:{scene},world:{facility:fac},run:{phase:'moon',quotaIndex:2},mods:new Emitter(),physics,
   aiPlayers:()=>[p],downed:{isDowned:id=>id===p.id&&p.downed},hostHurtPlayer:()=>hits++,net:{broadcast(){},sendRows(){}}};
  const api=installThreats13(game),M=new CreatureManager(game);game.creatures=M;for(let i=0;i<4;i++)physics.step(1/60);
  // Pick genuine same-room native LOS, far from the entrance safe zone.
  let pos;
  for(const r of rooms){const x=layout.ox+(r.x+r.w/2)*layout.cell,z=layout.oz+(r.z+r.h/2)*layout.cell;
   const q=new THREE.Vector3(x,layout.y,z);p.pos.copy(q).add(new THREE.Vector3(0,0,1.5));p.eye.copy(p.pos).add(new THREE.Vector3(0,1.62,0));
   if(!M.nearSafeZone(p)&&physics.lineOfSight(q.clone().add(new THREE.Vector3(0,1.28,0)),p.eye)){pos=q;break;}}
  assert(pos,'generated room offers actual unobstructed engagement');
  const c=M.hostSpawn(type,pos,{zone:'in',level:1,elite:false,variant:null,affix:null});assert(M.canSee(c,p,5,360));
  const step=()=>{physics.step(1/60);game.time=(game.time||0)+1/60;M.hostUpdate(1/60);};
  for(let i=0;i<400&&!['windup','scan'].includes(c.state);i++)step();
  assert.equal(c.state,type==='c13_printer'?'windup':'scan','native behavior acquired a living noisy player');
  if(type==='c13_checksum'){
   p.noise=0;for(let i=0;i<45;i++)step();assert.equal(hits,0,'genuine quiet interval cancels the scanner');assert.equal(c.state,'rest');
   p.noise=1;for(let i=0;i<600&&c.state!=='scan';i++)step();assert.equal(c.state,'scan','normal scan reacquires noisy target after recovery');
  }
  p.downed=true;
  for(let i=0;i<160;i++)step();
  assert.equal(hits,0,`${type} does not execute its locked attack after target becomes incapacitated`);
  // Revival does not disable the threat: its next real warning/hit still works.
  p.downed=false;for(let i=0;i<700&&hits===0;i++)step();assert(hits>0,'living noisy player remains vulnerable after normal warning');
  api.dispose();M.clear?.();fac.dispose(physics);physics.world.free();
 }
 console.log('counterplay19: native generated-facility warning/downed cancellation/revival attack pass');
}finally{globalThis.document=previous;}
