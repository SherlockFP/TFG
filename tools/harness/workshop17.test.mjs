import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {installWorkshop14} from '../../src/game/workshop14.js';
import {industryOf,transactIndustry,completeIndustryShift} from '../../src/game/industry13_core.js';
import {HOST_ONLY} from '../../src/net/session.js';
const mods=new Emitter(),handlers=new Map(),sent=[];
const run={runId:'workshop17',credits:100,quota:330};
const crew={pos:new THREE.Vector3(-1.12,0,.8)},friend={pos:new THREE.Vector3(-1.12,0,.8)};
const game={mods,run,selfId:'crew',isHost:true,time:0,aiPlayerById:id=>id==='crew'?crew:id==='friend'?friend:null,net:{sendTo(...args){sent.push(args)},request(){}},ui:{},broadcastRun(){},hostSave(){}};
const api=installWorkshop14(game,{near:()=>true,open(){},send(){}});api.bind(new THREE.Group());mods.emit('registerHandlers',(k,f)=>handlers.set(k,f));const act=handlers.get('w14act');
assert.equal(HOST_ONLY.has('w17state'),true,'peer cannot forge challenge/result channel');
transactIndustry(run,{op:'produce',product:'culture',physical:true});const job=industryOf(run).jobs[0],id=job.id;
act({op:'begin',id},'crew');assert.equal(api.sessions.size,0,'real field shift gate retained');completeIndustryShift(run,'hamsi',1);
crew.pos.set(50,0,50);act({op:'begin',id},'crew');assert.equal(api.sessions.size,0,'distant sender cannot begin');crew.pos.set(-1.12,0,.8);
act({op:'begin',id},'unknown');assert.equal(api.sessions.size,0,'unknown sender cannot begin');
act({op:'begin',id},'crew');let session=api.sessions.get('crew');assert.equal(session.mode,'signal');
act({op:'begin',id},'friend');assert.equal(api.sessions.has('friend'),false,'same batch has one active operator');
act({op:'step',id,token:'forged',step:0,terminal:session.sequence[0]},'crew');assert.equal(session.step,0,'forged token ignored');
game.time=.3;act({op:'step',id,token:session.token,step:2,terminal:session.sequence[2]},'crew');assert.equal(session.step,0,'arbitrary claimed progress rejected');
act({op:'step',id,token:session.token,step:0,terminal:session.sequence[0]%3+1},'crew');assert.equal(api.sessions.size,0,'wrong wiring ends attempt');assert.equal(job.tuned,false);assert.equal(run.credits,80,'failed wiring keeps already paid batch without extra fee');
act({op:'begin',id},'crew');session=api.sessions.get('crew');const canceled=session.token;
act({op:'cancel',id,token:canceled},'friend');assert.equal(api.sessions.size,1,'another player cannot cancel operator');
act({op:'cancel',id,token:canceled},'crew');assert.equal(api.sessions.size,0,'cancel leaves pending batch');assert.equal(job.tuned,false);
act({op:'begin',id},'crew');session=api.sessions.get('crew');assert.notEqual(session.token,canceled,'retry owns fresh attempt token');
for(let n=0;n<3;n++){game.time+=.3;act({op:'step',id,token:canceled,step:n,terminal:session.sequence[n]},'crew');assert.equal(session.step,n,'canceled token cannot advance retry');act({op:'step',id,token:session.token,step:n,terminal:session.sequence[n]},'crew');}
assert.equal(job.tuned,true,'actual host actions complete signal sequence');assert.equal(industryOf(run).goods.culture,undefined,'calibration alone cannot mint parcel');
act({op:'step',id,token:session.token,step:2,terminal:session.sequence[2]},'crew');assert.equal(industryOf(run).goods.culture,undefined);
act({op:'pack',id},'crew');act({op:'pack',id},'crew');assert.equal(industryOf(run).goods.culture,1,'one parcel despite replay');
transactIndustry(run,{op:'produce',product:'cells',physical:true});const cells=industryOf(run).jobs[0];completeIndustryShift(run,'hamsi',2);
act({op:'begin',id:cells.id},'crew');session=api.sessions.get('crew');assert.equal(session.mode,'pressure');game.time+=.3;act({op:'step',id:cells.id,token:session.token,step:0},'crew');assert.equal(api.sessions.size,0,'server rejects outside-band pressure');assert.equal(cells.tuned,false);
act({op:'begin',id:cells.id},'crew');session=api.sessions.get('crew');const start=game.time;
for(let n=0;n<3;n++){game.time=start+1.65+n*2.8;act({op:'beat',id:cells.id,token:session.token},'crew');act({op:'step',id:cells.id,token:session.token,step:n},'crew');}
assert.equal(cells.tuned,true,'three server-timed pressure pulses complete cells');assert.equal(run.credits,68,'both games leave shared wallet unchanged after commissions');
transactIndustry(run,{op:'produce',product:'culture',physical:true});const pending=industryOf(run).jobs[1];completeIndustryShift(run,'hamsi',3);crew.pos.set(0,0,.8);
act({op:'begin',id:pending.id},'crew');assert.equal(api.sessions.size,1);game.time+=2;mods.emit('update',.1);assert.equal(api.sessions.size,0,'missing heartbeat releases station without lost batch');assert.equal(pending.tuned,false);
act({op:'begin',id:pending.id},'crew');mods.emit('phase','takeoff');assert.equal(api.sessions.size,0,'phase transition releases attempts');api.dispose();assert.equal(api.bays.length,0);
console.log('workshop17 actual module: two patterns, completion/cancel/fail, replay/custody/distance/field gate and finite ledger passed');

// Exercise the real public industry handler while the sender is legitimately beside its broker.
const {installIndustry13}=await import('../../src/game/industry13.js');
const brokerMods=new Emitter(),brokerHandlers=new Map(),actor={pos:new THREE.Vector3(20,-.15,12.6)},brokerRun={runId:'public-guard',phase:'company',credits:100,quota:330};
const brokerGame={mods:brokerMods,run:brokerRun,selfId:'crew',isHost:true,time:0,aiPlayerById:()=>actor,net:{on_(){},request(){},sendTo(){}},shop:{open(){},hostCart(){}},ui:{},broadcastRun(){},hostSave(){}};
const broker=installIndustry13(brokerGame);brokerMods.emit('mapLoaded',{company:{group:new THREE.Group(),groundY:-1.25}});brokerMods.emit('registerHandlers',(k,f)=>brokerHandlers.set(k,f),brokerGame);
assert.equal(broker.near('crew'),true,'public route test has a legitimately nearby broker');
brokerHandlers.get('i13req')({op:'produce',product:'cells',orderId:'public-batch'},'crew');completeIndustryShift(brokerRun,'hamsi',1);const publicJob=industryOf(brokerRun).jobs[0];
brokerHandlers.get('i13req')({op:'calibrate',id:publicJob.id},'crew');brokerHandlers.get('i13req')({op:'pack',id:publicJob.id},'crew');assert.equal(publicJob.tuned,false,'actual public i13req cannot bypass challenge');assert.equal(industryOf(brokerRun).goods.cells,undefined);broker.dispose();
console.log('workshop17 actual public industry route rejects direct calibration/collection bypass');
