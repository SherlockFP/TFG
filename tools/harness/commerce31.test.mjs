// Native commerce boundaries. DOM and transport are fixtures; transactions,
// Session callbacks, ItemManager custody and Rapier delivery are the real modules.
import assert from 'node:assert/strict';
import test from 'node:test';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {Session} from '../../src/net/session.js';
import {installShop} from '../../src/game/shop.js';
import {installIndustry13} from '../../src/game/industry13.js';
import {industryOf,completeIndustryShift} from '../../src/game/industry13_core.js';
import {ItemManager} from '../../src/entities/items.js';
import {Physics,initPhysics} from '../../src/physics/physics.js';
document.createTextNode=text=>({textContent:text});
document.querySelectorAll=()=>[];document.head.append=()=>{};
const createElement=document.createElement;
document.createElement=(...args)=>Object.assign(createElement(...args),{setAttribute(){},replaceChildren(){}});
await initPhysics();

function fixture(){
 const physics=new Physics(),mods=new Emitter(),net=new Session({strategy:'local',isHost:true,code:'COM31',profile:{}}),messages=[];
 net.selfId='host';net.hostId='host';net.connected=true;
 // A packet recorder replaces only the unjoined transport, preserving Session
 // request, broadcast self-delivery and sendTo/receive callbacks.
 net.transport.send=(m,to)=>messages.push({m:structuredClone(m),to});
 const host={pos:new THREE.Vector3(20,-1.25,12.6),slots:[],dead:false,downed:false,inShip:false,heldItem:()=>null};
 const peer={...host,pos:host.pos.clone(),slots:[]};
 net.players.set('host',{id:'host'});net.players.set('peer',{id:'peer'});
 net.transport.peers.add('peer');
 const g={mods,net,physics,engine:{scene:new THREE.Scene()},camera:new THREE.PerspectiveCamera(),ship:{group:new THREE.Group()},selfId:'host',isHost:true,time:0,player:host,remotes:new Map([['peer',peer]]),creatures:{follow(){},host:new Map()},run:{runId:'commerce31',phase:'company',moon:'company',day:1,credits:300,quota:330,quotaIndex:0},world:{company:{group:new THREE.Group(),groundY:-1.25}},hubgate:{shopLock:false},onboard:{unlocks:()=>({mode:'all'})},aiPlayerById:id=>id==='host'?host:g.remotes.get(id),terminal:{hostExecute(){}},ui:{toast(){},sfx(){},closePanel(){},openShop(){},blocksInput:()=>false},audio:{ui(){},at(){},play(){}},onItemHeld(){},onItemDropped(){},broadcastRun(fields){net.broadcast('gs',Object.fromEntries(fields.map(k=>[k,g.run[k]])));},hostSave(){}};
 g.items=new ItemManager(g);net.on_('it',d=>g.items.onEvent(d));net.on_('fx',d=>mods.emit('fx',d));
 g.shop=installShop(g);g.industry13=installIndustry13(g);
 mods.emit('mapLoaded',g.world);physics.addStaticBox(20,-2.25,12,8,1,8);physics.world.step();
 mods.emit('registerHandlers',(name,fn)=>net.handle(name,fn),g);
 const request=(id,data)=>net.receive({t:'req',d:{a:'i13req',...data}},id);
 const buy=(orderId,lines)=>{let result;g.shop.hostCart({orderId,lines},'peer',(msg,err)=>result={msg,err});return result;};
 const close=()=>{net.flush();g.industry13.dispose();g.shop.dispose();for(const it of [...g.items.all()])g.items.onEvent({e:'rm',id:it.id});g.items.dispose();physics.dispose();};
 return {g,net,host,peer,request,buy,messages,close};
}

test('replayed broker request spends and consumes one batch, including restored ledger',()=>{
 const f=fixture();try{
  const command={op:'produce',product:'cells',orderId:'commission-1'};
  let replayed=false;f.net.on_('gs',()=>{if(!replayed){replayed=true;f.request('peer',command);}});
  f.request('peer',command);f.request('peer',command);
  assert.equal(f.g.run.credits,288,'one commission must debit 12 once');
  assert.equal(industryOf(f.g.run).jobs.length,1,'one delivery creates one paid batch');
  const job=industryOf(f.g.run).jobs[0];completeIndustryShift(f.g.run,'hamsi',1);
  f.net.receive({t:'req',d:{a:'w14act',op:'begin',id:job.id}},'peer');
  const token=f.g.industry13.workshop.sessions.get('peer').token;
  // One controlled native host clock; no claimed client completion.
  for(let step=0;step<3;step++){
   f.g.time=1.65+step*2.8;
   f.net.receive({t:'req',d:{a:'w14act',op:'beat',id:job.id,token}},'peer');
   f.net.receive({t:'req',d:{a:'w14act',op:'step',id:job.id,token,step}},'peer');
  }
  assert.equal(job.tuned,true);
  f.net.receive({t:'req',d:{a:'w14act',op:'pack',id:job.id}},'peer');
  assert.equal(industryOf(f.g.run).goods.cells,1);
  industryOf(f.g.run).goods.cells=2; // two independently owned batches; a replay may not sell the second
  const sale={op:'sell',product:'cells',orderId:'sale-1'};
  f.request('peer',sale);f.request('peer',sale);
  assert.equal(f.g.run.credits,311);assert.equal(industryOf(f.g.run).goods.cells,1);
  f.g.run=JSON.parse(JSON.stringify(f.g.run));f.request('peer',sale);
  assert.equal(f.g.run.credits,311,'saved ledger retains replay protection');
 }finally{f.close();}
});

test('a rejected commission keeps its request retryable and full bays cannot charge',()=>{
 const f=fixture();try{
  const command={op:'produce',product:'cells',orderId:'retry-after-funds'};
  f.g.run.credits=11;f.request('peer',command);
  assert.equal(f.g.run.credits,11);assert.equal(industryOf(f.g.run).jobs.length,0);
  f.g.run.credits=100;f.request('peer',command);f.request('peer',command);
  assert.equal(f.g.run.credits,88);assert.equal(industryOf(f.g.run).jobs.length,1);
  f.request('peer',{...command,orderId:'bay-2'});f.request('peer',{...command,orderId:'bay-3'});
  f.request('peer',{...command,orderId:'bay-4'});
  assert.equal(f.g.run.credits,64);assert.equal(industryOf(f.g.run).jobs.length,3);
 }finally{f.close();}
});

test('cart delivery rejects funds, full tray, stock and disconnected actor before debit',()=>{
 const f=fixture();try{
  const price=f.g.shop.priceOf('flashlight');f.g.run.credits=price-1;
  assert.equal(f.buy('poor',[{id:'flashlight',n:1}]).err,true);assert.equal([...f.g.items.all()].length,0);
  f.g.run.credits=300;
  assert.ok(!f.buy('full-a',[{id:'flashlight',n:10}]).err);
  assert.ok(!f.buy('full-b',[{id:'flashlight',n:2}]).err);
  const paid=f.g.run.credits;assert.equal([...f.g.items.all()].length,12);
  assert.equal(f.buy('overflow',[{id:'flashlight',n:1}]).err,true);
  assert.equal(f.g.run.credits,paid);assert.equal([...f.g.items.all()].length,12);
  assert.equal(f.buy('full-a',[{id:'flashlight',n:10}]).err,true);
  assert.equal(f.g.run.credits,paid);assert.equal([...f.g.items.all()].length,12);
  f.g.remotes.delete('peer');assert.equal(f.buy('disconnected',[{id:'flashlight',n:1}]).err,true);
  f.request('peer',{op:'produce',product:'cells',orderId:'gone'});assert.equal(f.g.run.credits,paid);
  f.g.remotes.set('peer',f.peer);for(const it of [...f.g.items.all()])f.g.items.onEvent({e:'rm',id:it.id});
  f.g.run.credits=10000;
  const limited=f.g.shop.stock().find(e=>!e.ship&&!e.locked&&!e.soldOut&&e.left!==null);
  assert.ok(limited,'fixture has eligible bounded stock');
  assert.ok(!f.buy('stock-a',[{id:limited.id,n:10}]).err);
  assert.equal([...f.g.items.all()].length,limited.left,'host clamps quantity to remaining stock');
  const afterStock=f.g.run.credits;
  assert.equal(f.buy('stock-b',[{id:limited.id,n:1}]).err,true);assert.equal(f.g.run.credits,afterStock);
 }finally{f.close();}
});

test('disconnect releases the workshop operator without losing the paid batch',()=>{
 const f=fixture();try{
  f.request('peer',{op:'produce',product:'culture',orderId:'disconnect-batch'});completeIndustryShift(f.g.run,'hamsi',1);
  const job=industryOf(f.g.run).jobs[0];
  f.net.receive({t:'req',d:{a:'w14act',op:'begin',id:job.id}},'peer');
  assert.equal(f.g.industry13.workshop.sessions.size,1);
  f.g.remotes.delete('peer');f.g.time=.1;f.g.mods.emit('update',.1,f.g);
  assert.equal(f.g.industry13.workshop.sessions.size,0);
  assert.equal(industryOf(f.g.run).jobs.length,1);assert.equal(job.tuned,false);assert.equal(f.g.run.credits,280);
 }finally{f.close();}
});

test('broker UI correlates replies so a stale result cannot unlock a new pending order',()=>{
 const f=fixture();try{
  const buttons=[];Object.assign(f.g.ui,{
   button(label,action){const node=document.createElement('button');buttons.push({label,action});return node;},
   panel:()=>document.createElement('div'),panelHead:()=>document.createElement('div'),panelFoot:()=>document.createElement('div'),
   openPanel(panel){this.panelOpen=panel;}
  });
  f.g.isHost=false;f.net.isHost=false;f.net.hostId='remote-host';f.net.transport.peers.add('remote-host');
  f.g.industry13.open();const commission=buttons.find(b=>b.label==='Commission').action;
  const sent=[];f.net.transport.send=(m)=>sent.push(m);
  const orders=()=>sent.flatMap(m=>m.t==='_b'?m.d:[m]).filter(m=>m.t==='req'&&m.d.a==='i13req');
  commission();commission();f.net.flush();assert.equal(orders().length,1);
  const first=orders()[0].d.orderId;assert.equal(typeof first,'string');
  f.net.receive({t:'i13reply',d:{orderId:first,ok:true}},'remote-host');
  commission();f.net.flush();assert.equal(orders().length,2);assert.notEqual(orders()[1].d.orderId,first);
  f.net.receive({t:'i13reply',d:{orderId:first,ok:true}},'remote-host');
  commission();f.net.flush();assert.equal(orders().length,2,'stale reply cannot admit another commission');
 }finally{f.close();}
});

test('one held trade-in cannot discount two cart lines',()=>{
 const f=fixture();try{
  f.g.items.onEvent({e:'sp',id:'trade-bat',ty:'bat',v:0,p:[20,0,12],h:'peer',slot:0});
  const before=f.g.run.credits,price=f.g.shop.priceOf('nailbat');
  const result=f.buy('two-trades',[{id:'nailbat',n:1,trade:true},{id:'nailbat',n:1,trade:true}]);
  assert.ok(!result.err);assert.equal(f.g.items.get('trade-bat'),undefined);
  assert.equal([...f.g.items.all()].filter(it=>it.type==='nailbat').length,2);
  assert.equal(f.g.run.credits,before-60-price,'one held bat earns exactly one upgrade discount');
 }finally{f.close();}
});

test('cart self-delivery cannot replay an order before its receipt is saved',()=>{
 const f=fixture();try{
  let replayed=false;
  f.net.on_('gs',()=>{if(!replayed){replayed=true;f.buy('reentrant-cart',[{id:'flashlight',n:1}]);}});
  const price=f.g.shop.priceOf('flashlight');
  assert.ok(!f.buy('reentrant-cart',[{id:'flashlight',n:1}]).err);
  assert.equal(f.g.run.credits,300-price);
  assert.equal([...f.g.items.all()].length,1,'native gs callback cannot duplicate delivery');
  assert.equal(industryOf(f.g.run).orders15.length,1,'one saved successful receipt');
 }finally{f.close();}
});

test('invalid request IDs and full receipt history reject before any commerce mutation',()=>{
 const f=fixture();try{
  for(const orderId of [undefined,'',42,'x'.repeat(65),'bad id']){
   assert.equal(f.buy(orderId,[{id:'flashlight',n:1}]).err,true);
   f.request('peer',{op:'produce',product:'cells',orderId});
  }
  assert.equal(f.g.run.credits,300);assert.equal([...f.g.items.all()].length,0);
  assert.equal(industryOf(f.g.run).jobs.length,0);
  industryOf(f.g.run).orders15=Array.from({length:4096},(_,i)=>`peer:old-${i}`);
  const result=f.buy('history-full',[{id:'flashlight',n:1}]);
  assert.equal(result.err,true);assert.match(result.msg,/new run/i);
  f.request('peer',{op:'produce',product:'cells',orderId:'history-full'});
  assert.equal(f.g.run.credits,300);assert.equal([...f.g.items.all()].length,0);
  assert.equal(industryOf(f.g.run).jobs.length,0);
 }finally{f.close();}
});

test('successful order stays protected after more than 64 other successful receipts',()=>{
 const f=fixture();try{
  industryOf(f.g.run).goods.cells=66; // pre-owned sale batches, no fabricated transaction result
  for(let i=0;i<65;i++){
   completeIndustryShift(f.g.run,'hamsi',i+1);
   f.request('peer',{op:'sell',product:'cells',orderId:`retained-${i}`});
  }
  const paid=f.g.run.credits;assert.equal(industryOf(f.g.run).goods.cells,1);
  f.request('peer',{op:'sell',product:'cells',orderId:'retained-0'});
  assert.equal(f.g.run.credits,paid);assert.equal(industryOf(f.g.run).goods.cells,1);
 }finally{f.close();}
});

test('last history slot is reserved before reentrant admission of another cart',()=>{
 const f=fixture();try{
  industryOf(f.g.run).orders15=Array.from({length:4095},(_,i)=>`peer:old-${i}`);
  let nested,reentered=false;
  f.net.on_('gs',()=>{if(!reentered){reentered=true;nested=f.buy('another-cart',[{id:'flashlight',n:1}]);}});
  const price=f.g.shop.priceOf('flashlight');
  assert.ok(!f.buy('last-cart',[{id:'flashlight',n:1}]).err);
  assert.equal(nested.err,true);assert.equal(f.g.run.credits,300-price);
  assert.equal([...f.g.items.all()].length,1);assert.equal(industryOf(f.g.run).orders15.length,4096);
 }finally{f.close();}
});
