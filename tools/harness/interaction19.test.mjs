import {register} from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
const {actionMethods}=await import('../../src/game/actions.js');
import {installFood} from '../../src/game/food.js';
import {installIncubator} from '../../src/game/pets_incubator.js';

// Capture real native points, preserving their authored positions/radii/reaches/actions.
const mods=new Emitter(),game={mods,profile:{},run:{phase:'orbit',day:1,quotaIndex:0},time:0,selfId:'me',isHost:true,remotes:new Map(),world:{},ship:{group:new THREE.Group()},
 player:{inShip:true,pos:new THREE.Vector3(-.38,0,2.4),heldItem:()=>null},items:{get:()=>null},net:{request(){}},
 physics:{addStaticBox:()=>({}),removeCollider(){}},camera:new THREE.PerspectiveCamera()};
const food=installFood(game),incubator=installIncubator(game,{open(){}});mods.emit('hostStart',game);
const native=[];mods.emit('interactables',native,game);
const nest=native.find(p=>typeof p.label==='function'&&p.label().includes('Incubator')),table=native.find(p=>p.label==='Ship table [E]');
assert.ok(nest&&table,'real installed stations produce native function/static-label points');
const direction=table.pos.clone().sub(nest.pos).normalize();game.camera.position.copy(nest.pos).addScaledVector(direction,-.2);game.camera.lookAt(table.pos);game.camera.updateMatrixWorld();
let visible=false,labelCalls=0,subCalls=0,hiddenSubCalls=0,ray=null;
// Explicit dynamic-hide fixture: a native point's supported function label toggles null.
// Current Voyage already prefilters its null labels; this test does not claim that module emits one today.
const hidden={...nest,label(){labelCalls++;return visible?'Incubator [E]':null;},sub(){hiddenSubCalls++;return 'hidden details';}};
const valid={...table,sub(){subCalls++;return 'real mess table';}};
let points=[hidden,valid];game.interactablesNow=()=>points;game.physics.raycast=()=>ray;
const choose=()=>actionMethods.findInteraction.call(game);
const result=choose();assert.equal(result?.label,'Ship table [E]','a hidden nearer native function-label point must not swallow the usable table');
assert.equal(labelCalls,1,'candidate label resolves once');assert.equal(subCalls,1);assert.equal(hiddenSubCalls,0,'only the final winner resolves its details');
visible=true;subCalls=0;const shown=choose();assert.equal(shown.label,'Incubator [E]');assert.equal(subCalls,0,'unselected point details remain lazy');
for(const invalid of [null,'','   ',false,42,{}]){visible=false;points=[{...nest,label:()=>invalid},valid];assert.equal(choose()?.label,'Ship table [E]');}
// The same invalid labels cannot replace an already-valid candidate encountered first.
points=[valid,hidden];assert.equal(choose()?.label,'Ship table [E]');
ray={distance:.1,info:{kind:'static'}};points=[hidden,valid];assert.equal(choose(),null,'ordinary point LOS remains blocked');
points=[hidden,{...valid,noLos:true}];assert.equal(choose()?.label,'Ship table [E]','explicit noLos contract is retained');
// Physics item and door priority remain ahead of every point candidate.
const big={state:'world',def:{kind:'big',name:'Large Axle'},type:'axle',value:30};game.items.get=()=>big;
ray={distance:1,info:{kind:'item',itemId:'native'}};assert.equal(choose()?.bigItem,big);
const door={};ray={distance:1,info:{kind:'door',door}};game.doorInteraction=d=>({label:'native door',action(){}});assert.equal(choose()?.label,'native door');
ray=null;visible=true;labelCalls=0;points=[hidden,{...valid,label(){throw new Error('farther candidate label should not resolve');}}];assert.equal(choose()?.label,'Incubator [E]');assert.equal(labelCalls,1);
food.dispose();incubator.dispose();
console.log('interaction19: actual selector/native station points hidden-label fallback, lazy details, LOS/noLos and item/door priority pass');
