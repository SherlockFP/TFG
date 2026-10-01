import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {initPhysics,Physics} from '../../src/physics/physics.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {installCreatures20} from '../../src/game/creatures20.js';
import {ItemManager} from '../../src/entities/items.js';
import {poolFor} from '../../src/game/threatpool.js';
import {canSpawnMore,spawnTable} from '../../src/game/creatures.js';
import {LAB20_MOONS} from '../../src/game/lab20_moons.js';
import {createCreature20} from '../../src/models/creatures20.js';
import {creature20Cue} from '../../src/game/creatures20_audio.js';
await initPhysics();
const previous=globalThis.document,oldWindow=globalThis.window;delete globalThis.window;
const canvas=()=>({width:64,height:64,style:{},getContext:()=>new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:10}):(k==='createImageData'||k==='getImageData')?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true})});
globalThis.document={createElement:()=>canvas()};
const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
try{
 for(const type of ['c20_pixel','c20_brute']){
  delete globalThis.window;const physics=new Physics(),scene=new THREE.Scene(),layout=generateLayout(1235,'factory',.8);
  const fac=buildFacility(layout,{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);
  const rooms=layout.rooms.filter(r=>r.type!=='entrance');let hits=0;
  const p={id:'crew',zone:'in',dead:false,downed:false,inShip:false,noise:1,voice:0,pos:new THREE.Vector3(),eye:new THREE.Vector3()};
  const game={isHost:true,scene,engine:{scene},world:{facility:fac},run:{phase:'moon',quotaIndex:2},mods:new Emitter(),physics,selfId:'crew',onItemHeld(){},
   aiPlayers:()=>[p],downed:{isDowned:id=>id===p.id&&p.downed},hostHurtPlayer:()=>hits++,net:{hostId:'crew',selfId:'crew',broadcast(k,d){if(k==='it')game.items.onEvent(d);},sendRows(){}}};
  for(let i=0;i<4;i++)physics.step(1/60);globalThis.window={__kefalMods:{itemModels:new Map(),creatureModels:new Map()},KefalAPI:{THREE}};game.items=new ItemManager(game);const api=installCreatures20(game),M=new CreatureManager(game);game.creatures=M;
  // Pick genuine same-room native LOS, far from the entrance safe zone.
  let pos;
  for(const r of rooms){const x=layout.ox+(r.x+r.w/2)*layout.cell,z=layout.oz+(r.z+r.h/2)*layout.cell;
   const q=new THREE.Vector3(x,layout.y,z);p.pos.copy(q).add(new THREE.Vector3(0,0,1.5));p.eye.copy(p.pos).add(new THREE.Vector3(0,1.62,0));
   if(!M.nearSafeZone(p)&&physics.lineOfSight(q.clone().add(new THREE.Vector3(0,1.28,0)),p.eye)){pos=q;break;}}
  assert(pos,'generated room offers actual unobstructed engagement');
  for(const moon of LAB20_MOONS){
   const resident=moon.id==='archive20'?'c20_pixel':'c20_brute',other=resident==='c20_pixel'?'c20_brute':'c20_pixel';
   assert(spawnTable(moon,'in',{seed:1235,quotaIndex:2})[resident]>0,'authored native lab has a positive natural candidate');
   game.run.quotaIndex=0;assert(!canSpawnMore(resident,new Map()),'quota-zero native spawn gate rejects the lab candidate');
   game.run.quotaIndex=2;assert(canSpawnMore(resident,new Map()),'quota-two native spawn gate admits the rare lab resident');
   const partner=M.hostSpawn(other,pos,{zone:'in',level:1,elite:false,variant:null,affix:null});
   assert(!canSpawnMore(resident,M.host),'living native family partner blocks natural spawn');M.hostRemove(partner.id);
  }
  const c=M.hostSpawn(type,pos,{zone:'in',level:1,elite:false,variant:null,affix:null,yaw:0});assert(M.canSee(c,p,5,360));
  const step=()=>{physics.step(1/60);game.time=(game.time||0)+1/60;M.hostUpdate(1/60);};
  assert(canSpawnMore(type,M.host)===false,'spawn gate reserves a single family member');
  const id=game.items.hostSpawn('copper',p.pos.clone(),{value:30}),item=game.items.get(id);
  assert(item,'real native ItemManager creates the fixture salvage');
  if(type==='c20_pixel'){
   for(let i=0;i<200;i++)step();assert.equal(c.state,'idle','world salvage alone does not identify a carrier');
   item.setHeld(p.id);item.inv={k:'bag'};for(let i=0;i<100;i++)step();assert.equal(c.state,'idle','bagged cargo is not visibly carried');
   item.inv=null;
  }
  // A real newly inserted thin panel is unknown to the cached nav graph.
  // Native chase can plan across it, but body-width movement must stop physically.
  p.pos.copy(c.pos).add(new THREE.Vector3(0,0,4));p.eye.copy(p.pos).add(new THREE.Vector3(0,1.62,0));
  for(let i=0;i<20&&c.state!=='chase';i++)step();assert.equal(c.state,'chase');
  const beforePanel=c.pos.clone(),panel=physics.addStaticBox(c.pos.x,layout.y+1.3,c.pos.z+1.2,2,1.3,.04);
  for(let i=0;i<140;i++)step();assert(c.pos.z<=beforePanel.z+1.2-.04-c.def.radius+.03,'real capsule cannot traverse a thin panel absent from nav');
  physics.removeCollider(panel);p.pos.copy(c.pos).add(new THREE.Vector3(0,0,1.5));p.eye.copy(p.pos).add(new THREE.Vector3(0,1.62,0));
  for(let i=0;i<600&&c.state!=='windup';i++)step();assert.equal(c.state,'windup','native behavior starts a genuine readable warning');
  assert.equal(hits,0,'no hit before warning completes');
  if(type==='c20_pixel'){
   item.inv={k:'bag'};for(let i=0;i<100;i++)step();assert.equal(hits,0,'putting away cargo cancels the swipe');
   item.inv=null;for(let i=0;i<700&&c.state!=='windup';i++)step();assert.equal(c.state,'windup');
  }
  p.downed=true;for(let i=0;i<130;i++)step();assert.equal(hits,0,'downed during warning cancels attack');
  p.downed=false;for(let i=0;i<700&&c.state!=='windup';i++)step();assert.equal(c.state,'windup');
  // Actual newly closed cover, not a forced LOS result, cancels the pending strike.
  const mid=c.pos.clone().add(p.pos).multiplyScalar(.5),wall=physics.addStaticBox(mid.x,layout.y+1.3,mid.z,2,1.3,.08);
  for(let i=0;i<130;i++)step();assert.equal(hits,0,'physical wall blocks the wound-up attack');physics.removeCollider(wall);
  for(let i=0;i<800&&hits===0;i++)step();assert(hits>0,'living exposed target remains vulnerable after full native warning');
  if(type==='c20_brute')assert(item.body.linvel().x**2+item.body.linvel().z**2<=2.5**2+.01,'native loose prop impulse remains speed-bounded');
  game.escape14={active:()=>true};assert(!canSpawnMore(type,new Map()),'active Warden suppresses spawn');const before=hits;for(let i=0;i<500;i++)step();assert.equal(hits,before,'active Warden suppresses overlapping damage');
  for(const it of game.items.all())it.dispose();game.items.items.clear();game.items.dispose();
  api.dispose();M.clear?.();fac.dispose(physics);physics.world.free();
 }
 for(let q=0;q<5;q++)for(let seed=0;seed<400;seed++){const p=poolFor({seed,quotaIndex:q},{id:'c20-fixture',creatures:{}});assert(p.ids.filter(id=>id.startsWith('c20_')).length<=1);if(q<2)assert(!p.ids.some(id=>id.startsWith('c20_')));}
 for(const id of ['c20_pixel','c20_brute']){const m=createCreature20(id);let draws=0,triangles=0;m.root.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;assert.equal(o.material.type,'MeshLambertMaterial');}});assert(draws<=20&&triangles<1400);m.update(.016,{state:'windup',time:1,speed:0});m.dispose();m.dispose();}
 for(const id of ['c20_pixel_tell','c20_brute_tell']){const cue=creature20Cue(id,16000);assert(cue.every(Number.isFinite));assert(Math.max(...cue.map(Math.abs))<.4);}
 console.log('creatures20: real native warning/custody/cover/downed/physics and bounded pool/model/audio pass');
}finally{globalThis.document=previous;globalThis.window=oldWindow;}
