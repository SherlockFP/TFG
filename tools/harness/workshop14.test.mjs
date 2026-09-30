import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {installWorkshop14} from '../../src/game/workshop14.js';
import {transactIndustry,industryOf,completeIndustryShift} from '../../src/game/industry13_core.js';
const mods=new Emitter(),handlers=new Map(),sent=[];
const run={runId:'workshop14',credits:100,quota:330,moon:'hamsi'};
const pl={id:'crew',dead:false,downed:false,pos:new THREE.Vector3(-1.12,0,.8)};
const game={mods,run,time:0,isHost:true,selfId:'crew',aiPlayerById:id=>id==='crew'?pl:null,net:{sendTo(...a){sent.push(a)},request(){}},ui:{toast(){},blocksInput(){return false}},broadcastRun(){},hostSave(){}};
const api=installWorkshop14(game,{near:()=>true,open(){},send(){}});const parent=new THREE.Group(),vendor=new THREE.Group();parent.position.y=-260;vendor.position.set(20,-1.25,12);parent.add(vendor);api.bind(vendor);assert.equal(api.bays[0].pos.y,-259.75,'builder may initially hide map');parent.position.y=0;assert.equal(api.bays[0].pos.y,.25,'bay must resolve updated parent matrix after visible placement');assert.equal(api.scout.pos.y,-.25,'scout interaction follows visible parent');vendor.position.set(0,0,0);mods.emit('registerHandlers',(name,fn)=>handlers.set(name,fn));
transactIndustry(run,{op:'produce',product:'cells',physical:true});const id=industryOf(run).jobs[0].id;
completeIndustryShift(run,'hamsi',1);assert.equal(industryOf(run).goods.cells,undefined,'field shift alone cannot bypass calibration');
const points=[];mods.emit('interactables',points);const control=points.find(p=>p.pos.equals(api.bays[0].pos));assert.equal(control.r,.45,'control target covers visible press face');assert.equal(control.reach,2.6,'aim forgiveness must not expand reach');assert.match(control.label,/1/,'numbered bay is recognizable');
const act=handlers.get('w14act');act({op:'pack',id},'crew');assert.equal(industryOf(run).goods.cells,undefined,'unprepared parcel cannot collect');
act({op:'hold',id},'crew');game.time=1;mods.emit('update',1);assert.equal(api.sessions.size,0,'legacy hold cannot bypass interactive calibration');
act({op:'begin',id},'crew');let session=api.sessions.get('crew');const token=session.token;
for(let n=0;n<3;n++){game.time=1+1.65+n*2.8;act({op:'beat',id,token},'crew');act({op:'step',id,token,step:n},'crew');}
assert.equal(industryOf(run).jobs[0].tuned,true,'actual host validates three pressure pulses');
assert.equal(run.credits,88,'calibration itself cannot pay currency');
pl.dead=true;act({op:'pack',id},'crew');assert.equal(industryOf(run).jobs.length,1,'dead peer cannot claim');
pl.dead=false;pl.pos.set(20,0,20);act({op:'pack',id},'crew');assert.equal(industryOf(run).jobs.length,1,'distant peer cannot claim');
pl.pos.set(-1.12,0,.8);act({op:'pack',id},'crew');assert.equal(industryOf(run).goods.cells,1);assert.equal(industryOf(run).jobs.length,0);
act({op:'pack',id},'crew');assert.equal(industryOf(run).goods.cells,1,'replayed collection cannot duplicate goods');
transactIndustry(run,{op:'sell',product:'cells'});assert.equal(run.credits,111,'one actual parcel uses existing finite payout');
api.dispose();assert.equal(api.bays.length,0);assert.equal(api.sessions.size,0);
console.log('workshop14 actual module heartbeat, living/distance guards, single parcel and existing payout passed');
// Trading pickup surface uses real Rapier rays, not predicted terrain height.
const {Physics,initPhysics}=await import('../../src/physics/physics.js');
const {createTrading15}=await import('../../src/game/trading15.js');
await initPhysics();const physics=new Physics();physics.addStaticBox(20,-2.25,12,8,1,8);
const tradingParent=new THREE.Group(),tradingVendor=new THREE.Group();tradingParent.position.y=-260;tradingVendor.position.set(20,-1.25,12);tradingParent.add(tradingVendor);
const goods=[];const trade=createTrading15({physics,items:{all:()=>goods}},id=>id==='crew');trade.bind(tradingVendor);tradingParent.position.y=0;trade.sync();physics.step(1/30);
const delivery=trade.plan('crew',['flashlight','walkie']);assert.equal(delivery.length,2);assert.ok(delivery.every(p=>p.x>18&&p.y>0&&p.z>13),'items deliver above real visible pickup surface, outside hidden builder');assert.notDeepEqual(delivery[0].toArray(),delivery[1].toArray(),'mixed orders get distinct positions');assert.equal(trade.plan('far',['flashlight']),null);
for(const p of delivery){const obj=new THREE.Group();obj.position.copy(p);goods.push({state:'world',obj});}
const next=trade.plan('crew',['flashlight']);assert.notDeepEqual(next[0].toArray(),delivery[0].toArray(),'new order avoids uncollected package position');assert.equal(trade.plan('crew',Array(13).fill('flashlight')),null,'physical pickup tray capacity is bounded');trade.dispose();physics.dispose();
console.log('trading15 real Rapier delivery, hidden-map placement and pickup capacity passed');
