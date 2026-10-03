import './ship2_env.mjs';
import assert from 'node:assert/strict';
import { Physics,initPhysics } from '../../src/physics/physics.js';
import { generateLayout,buildFacility } from '../../src/world/facility.js';
import { normalizeLights38 } from '../../src/world/interiors/lighting38.js';
await initPhysics();
for(const theme of ['factory','serverfarm','hospital','threadarchive']){
 const physics=new Physics(),fac=buildFacility(generateLayout(17,theme,.9),{physics,lightPool:{add:e=>e,remove(){}}});
 const lamps=fac.emitters.filter(e=>e.group==='facility');assert.ok(lamps.length>0);
 assert.ok(lamps.every(e=>e.color===0xe6ded0&&!(e.flicker>0)),`${theme}: ordinary lighting is steady neutral industrial white`);
 assert.equal(fac.atmosphere.lighting38,'neutral');fac.dispose(physics);physics.world.free();
}
const intentional=[{group:'facility',color:0xfff0c0,flicker:.3},{group:'facility',color:0x92c7e6,flicker:0}],before=structuredClone(intentional);normalizeLights38({theme:'backrooms'},intentional);assert.deepEqual(intentional,before,'authored yellow/pool liminal palettes remain intact');
const normal=[{group:'facility',color:0xff00ff,flicker:.7},{group:'laser',color:0xff2222,flicker:0}];normalizeLights38({theme:'factory'},normal);assert.equal(normal.length,2,'light count stays constant');assert.equal(normal[1].color,0xff2222,'purposeful hazard cue remains red');
console.log('lighting38: real normal facilities use steady neutral lamp palette and ambient identity');
