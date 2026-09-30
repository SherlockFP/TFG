import assert from 'node:assert/strict';
import {loadable,takeCargo,CUSTODY,slotCost,portalAllowed} from '../../src/game/cargo13_core.js';
const mk=(id,w=15)=>({id,def:{weight:w,kind:'scrap'},state:'world',holder:null,owner:null});
const items=new Map(Array.from({length:10},(_,i)=>[String(i),mk(String(i))]));const get=id=>items.get(id);const ids=[];
for(let i=0;i<8;i++){const it=get(String(i));assert.equal(loadable(it,'peer',ids,get),true);ids.push(it.id);it.holder=CUSTODY;it.state='held';}
assert.equal(loadable(get('8'),'peer',ids,get),false,'capacity cannot overfill');
assert.equal(loadable(get('0'),'peer',[],get),false,'cart-held item cannot be loaded twice or stolen');
const state={ids};assert.equal(takeCargo(state,'0'),true);assert.equal(takeCargo(state,'0'),false,'unload is exactly once');
assert.equal(loadable({...get('8'),def:{weight:20}},'peer',ids,get),false,'weight limit survives free slot');
assert.equal(loadable({...get('8'),holder:'other',state:'held'},'peer',ids,get),false,'cannot load another players item');
assert.equal(loadable({...get('8'),owner:'peer'},'peer',ids,get),false,'active beam ownership rejected');
assert.equal(loadable({...get('8'),holder:'peer',state:'held'},'peer',ids,get),true,'own held portable item may load');
assert.equal(loadable({...get('8'),soulbound:'profile'},'peer',ids,get),false);
console.log('cargo13 custody, capacity, weight and single-unload invariants passed');

const big=mk('big',90);big.def.kind='big';assert.equal(slotCost(big),4);assert.equal(loadable(big,'peer',[],get),true,'stationary big prop fits basket');assert.equal(loadable({...big,owner:'peer'},'peer',[],get),false,'beam-held big prop cannot load');
const coords=x=>({x,distanceTo(other){return Math.abs(x-other.x);}});
assert.equal(portalAllowed('peer','peer',coords(1),coords(2),coords(0)),true);
assert.equal(portalAllowed('peer','other',coords(1),coords(2),coords(0)),false,'only cart driver transfers');
assert.equal(portalAllowed('peer','peer',coords(1),coords(30),coords(0)),false,'cannot teleport distant cart');
// Fault-repaired launch may bypass the outer takeoff wrapper after the driver let go.
const {Emitter}=await import('../../src/core/events.js');
const {installCargo13}=await import('../../src/game/cargo13.js');
const mods=new Emitter(),dropEvents=[];
const cargo={map:'test',p:[0,0,0],yaw:0,driver:null,ids:['loaded']};
const loaded={id:'loaded',holder:CUSTODY,value:123};
const game={mods,isHost:true,run:{phase:'moon',cargo13:cargo},items:{get:id=>id===loaded.id?loaded:null,all:()=>[]},net:{on_(){},broadcast(type,data){if(type==='it')dropEvents.push(data);}},broadcastRun(){}};
const api=installCargo13(game);
game.run.phase='takeoff';mods.emit('phase','takeoff',game);
assert.equal(dropEvents.length,1,'actual takeoff unloads stopped cargo before daily accounting');
assert.equal(dropEvents[0].id,'loaded');assert.equal(loaded.value,123);
assert.deepEqual(cargo.ids,[]);
mods.emit('phase','takeoff',game);assert.equal(dropEvents.length,1,'repeat phase does not duplicate cargo');
api.dispose();
console.log('cargo13: stopped trolley delayed-launch regression passed');
