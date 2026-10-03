// Native preflight: real seeded facilities, real Rapier geometry and certified crew/cargo lift routes.
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import { Physics,initPhysics } from '../../src/physics/physics.js';
import { generateLayout,buildFacility } from '../../src/world/facility.js';
import { buildDescent21 } from '../../src/world/descent21.js';
import { chooseSafeFloor } from '../../src/game/descent21_state.js';
import { floorSpec } from '../../src/game/descent21_core.js';
import { MOONS } from '../../src/game/moons.js';
await initPhysics();let checked=0;const themes=new Set();
for(const seed of [1,17,42,1235])for(const depth of [1,2,3]){
 const selected=chooseSafeFloor(MOONS.hamsi,seed,depth,(_,choice)=>{
  const ph=new Physics();let fac=null,lift=null;
  try{fac=buildFacility(generateLayout(choice.seed,choice.theme,choice.size,choice.layoutOpts),{physics:ph,lightPool:{add:e=>e,remove(){}}});ph.world.step();lift=buildDescent21({facility:fac,physics:ph,floor:depth});
   if(!lift)return null;assert.ok(lift.plan.routeProof,'actual native capsule/crew route certificate');assert.ok(lift.plan.discoveryRooms.length>0);return structuredClone(lift.plan);
  }finally{lift?.dispose();fac?.dispose(ph);ph.world.free();}
 },{routeVersion:38});
 assert.ok(selected,`new seeded route ${seed}/${depth} has a native safe cabin`);themes.add(selected.choice.theme);
 if(depth===3){assert.equal(selected.choice.theme,'backrooms');assert.equal(floorSpec(MOONS.hamsi,seed,depth,{routeVersion:38}).layoutOpts.open35.kind,'reception');}
 checked++;
}
assert.ok(themes.size>=4);console.log(`exploration38 routes: ${checked} real seeded routes, ${themes.size} palettes, preserved Backrooms/capsule certificates`);
