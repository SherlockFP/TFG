// Actual Company annex + club bodies, standing controller approaches, localized cached atlas and once-only cleanup.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Physics,initPhysics,G,groups} from '../../src/physics/physics.js';
import {buildCompany} from '../../src/world/company.js';
import {makeClub,STATIONS} from '../../src/game/casino13_models.js';
import {setLang} from '../../src/core/i18n.js';
await initPhysics();const ph=new Physics(),map=buildCompany({physics:ph,lightPool:{add:e=>e,remove(){}}}),club=makeClub(map.casinoSpace,{physics:ph});map.group.add(club.root);ph.world.step();
assert.deepEqual(STATIONS.map(s=>s.id),['cashier','slots','wheel','packet','blackjack','poker']);assert.equal(club.metrics.colliders,15);assert.equal(club.metrics.emitters,0);assert.ok(club.metrics.batches<=8);assert.ok(club.metrics.triangles<4500);
let lights=0;club.root.traverse(o=>{if(o.isLight)lights++});assert.equal(lights,0);
function walk(points,label){const a=points[0],actor=ph.createKinematicCapsule(new THREE.Vector3(a[0],-1.25+.92,a[1]),.56,.34,G.PLAYER,G.STATIC|G.DOOR),cc=ph.createController(.02);ph.world.step();try{for(const [x,z]of points.slice(1)){const max=Math.ceil(Math.hypot(x-actor.body.translation().x,z-actor.body.translation().z)/.1)+120;for(let i=0;i<max;i++){const p=actor.body.translation(),dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<.06)break;const k=Math.min(.1,d)/d;cc.computeColliderMovement(actor.col,{x:dx*k,y:-.012,z:dz*k},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const m=cc.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});ph.world.step();}const p=actor.body.translation();assert.ok(Math.hypot(p.x-x,p.z-z)<.12,`${label} standing route blocked at ${x},${z}: ${JSON.stringify(p)}`);}}finally{ph.world.removeCharacterController(cc);ph.removeBody(actor.body);}}
for(const s of club.spots){const path=[[-29,-10.2],[-29,s.pos.z],[s.pos.x,s.pos.z]];walk([...path,...path.slice(0,-1).reverse()],s.id);assert.ok(ph.lineOfSight(new THREE.Vector3(s.pos.x,-1.25+1.62,s.pos.z),s.pos,G.STATIC|G.DOOR),`${s.id} standing control LOS`);}
// Annex work cannot block the native freight/sale lane.
walk([[0,10],[-9.5,10],[-9.5,-12],[0,-12],[0,-33.6]],'native sale');
const initial=club.metrics.redraws;for(let i=0;i<100;i++)club.setRecent([]);assert.equal(club.metrics.redraws,initial,'unchanged empty ledger does not upload atlas');club.setRecent([{station:'poker',paid:25,cardSummary:'PAIR / DEALER HIGH'}]);assert.equal(club.metrics.redraws,initial+1);for(let i=0;i<100;i++)club.setRecent([{station:'poker',paid:25,cardSummary:'PAIR / DEALER HIGH'}]);assert.equal(club.metrics.redraws,initial+1);setLang('tr');setLang('ru');setLang('en');assert.equal(club.metrics.redraws,initial+4);
const resources=new Set();club.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);if(o.material.map)resources.add(o.material.map)}});let releases=0;for(const r of resources)r.addEventListener('dispose',()=>releases++);club.dispose();club.dispose();assert.equal(releases,resources.size,'every owned geometry/material/atlas released once');map.dispose(ph);assert.equal(ph.info.size,0);ph.world.free();console.log('casino24 native six-station access/sale/atlas/lifecycle PASS',JSON.stringify(club.metrics));
