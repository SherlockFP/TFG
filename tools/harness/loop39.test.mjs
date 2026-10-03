import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {buildShip} from '../../src/world/ship.js';
import {buildCompany} from '../../src/world/company.js';
import {Session} from '../../src/net/session.js';
import {Emitter} from '../../src/core/events.js';
import {ItemManager} from '../../src/entities/items.js';
import {installReactor38} from '../../src/game/reactor38.js';
import {hostMethods} from '../../src/game/host.js';
import {installCompany13} from '../../src/game/company13.js';
import {installHostMig} from '../../src/game/hostmig.js';
import {Objectives} from '../../src/game/objectives.js';
import {installOneGoal} from '../../src/game/onegoal.js';
import {setLang} from '../../src/core/i18n.js';

// Catches a stranded zero-credit crew after its last physical core is sold.
// Real ship/floor/LOS, Session self-delivery and native sale own the transaction.
await initPhysics();
const physics=new Physics(),scene=new THREE.Scene(),mods=new Emitter();
const ship=buildShip({physics,scene,lightPool:{add:x=>x}});
const company=buildCompany({physics,lightPool:{add:x=>x,remove(){}}});
const net=new Session({strategy:'local',isHost:true,code:'loop39'});net.selfId=net.hostId='H';net.players.set('H',{id:'H'});
const player={id:'H',pos:new THREE.Vector3(5.3,.05,-2.3),dead:false,downed:false,inShip:true,indoor:false,slots:[],eyePos(){return this.pos.clone().add(new THREE.Vector3(0,1.62,0));},heldItem(){return game.items.get(this.slots[0]);}};
const timers=[],messages=[],saves=[],sales=[];let leverCalls=0;
const game={physics,engine:{scene},scene,ship,mods,net,selfId:'H',isHost:true,player,remotes:new Map(),world:{company,moonId:'hq',seed:17},hostData:{},run:{runId:'loop39',phase:'company',moon:'hq',seed:17,day:2,daysLeft:0,credits:0,sold:0,buyRnd:1},ui:{toast(){}},onItemHeld(it,holder){if(holder==='H')player.slots=[it.id];},onItemDropped(){},hostSave(){},broadcastRun(){},aiPlayers:()=>[player],later(fn,ms){timers.push({fn,ms});},hostSell:hostMethods.hostSell,hostLever(){leverCalls++;this.run.phase='landing';mods.emit('phase','landing',this);}};
Object.defineProperty(game,'isHost',{get:()=>net.isHost});
game.profile={coins:0,bounties:[]};game.broadcastRun=hostMethods.broadcastRun;
game.hostSave=()=>saves.push(JSON.parse(JSON.stringify(game.run)));
game.items=new ItemManager(game);net.on_('it',d=>game.items.onEvent(d));net.on_('sys',d=>messages.push(d));net.on_('sell',d=>sales.push(d));
net.handle('bell',(_,from)=>game.hostSell(from));
const api=installReactor38(game);mods.emit('hostStart',game);mods.emit('registerHandlers',(k,fn)=>net.handle(k,fn),game);physics.step(1/30);
const companyApi=installCompany13(game),onegoal=installOneGoal(game);game.onegoal=onegoal;
const request=(op,extra={})=>net.request('reactor38',{...api.receipt(),op,...extra});
const flush=()=>{for(const t of timers.splice(0))t.fn();};
try{
 api.state().ready=false;
 request('service');assert.equal(api.state().services,undefined,'spent physical core must be removed first');
 request('remove');assert.equal(api.state().installed,null);
 const servicePacket={...api.receipt(),op:'service'};
 net.players.set('L',{id:'L'});game.remotes.set('L',{pos:player.pos.clone(),dead:false});net.lost.set('L',{});
 api.exchange(servicePacket,'L');assert.equal(api.state().ready,false,'disconnected crew position cannot buy emergency fuel');
 net.lost.delete('L');net.players.delete('L');game.remotes.delete('L');
 for(const bad of ['dead','downed','far','wrong-floor','wall','wrong-phase','wrong-moon','wrong-map','wrong-seed','unknown','stale-token','stale-revision','demoted']){
  const baseline=JSON.stringify(game.run),pose=player.pos.clone();
  player.dead=bad==='dead';player.downed=bad==='downed';
  if(bad==='far')player.pos.x=0;if(bad==='wrong-floor')player.pos.y=2;
  const wall=bad==='wall'?physics.addStaticBox(5.5,1.5,-2.4,.03,1,.7):null;
  if(bad==='wrong-phase')game.run.phase='orbit';if(bad==='wrong-moon')game.run.moon='hamsi';
  if(bad==='wrong-map')game.world.moonId='hamsi';if(bad==='wrong-seed')game.world.seed=99;
  if(bad==='demoted')net.isHost=false;
  physics.step(1/30);
  api.exchange({...servicePacket,...(bad==='stale-token'?{token:'old-run'}:{}),...(bad==='stale-revision'?{revision:'old'}:{})},bad==='unknown'?'Q':'H');
  assert.equal(api.state().ready,false,bad+' refuel rejected');assert.equal(api.state().services,undefined,bad+' consumes no service receipt');
  game.run=JSON.parse(baseline);player.dead=player.downed=false;player.pos.copy(pose);game.world.moonId='hq';game.world.seed=17;net.isHost=true;
  if(wall)physics.removeCollider(wall);physics.step(1/30);
 }
 let reentered=false;const originalGS=net.msgHandlers.get('gs');
 net.on_('gs',d=>{originalGS?.(d);if(d.reactor38?.services===1&&!reentered){reentered=true;net.request('reactor38',servicePacket);}});
 request('service');
 assert.equal(api.state().ready,true,'empty HQ socket refuels a zero-credit crew');
 assert.equal(game.run.credits,0);assert.equal(api.state().serviceDebt,60,'unpaid fuel uses the native reactor receipt');
 assert.equal(api.state().installed.value,0,'emergency fuel is not sellable stock');
 assert(reentered,'actual native gs self-delivery replays service');assert.equal(api.state().services,1);
 net.request('reactor38',servicePacket);assert.equal(api.state().serviceDebt,60,'delayed accepted request cannot charge twice');
 const emergencyId=api.state().installed.id;
 request('remove');assert.equal(game.items.get(emergencyId).value,0,'removing emergency fuel produces spent native cargo only');
 const choiceId=game.items.hostSpawn('reactor',player.pos.clone(),{value:220});
 const labels=[{type:'reactor',itemId:choiceId,sub:'Value: ▮220'},{type:'reactor',itemId:emergencyId,sub:'Value: ▮0'}];
 mods.emit('scanLabels',labels,null,null,game);
 assert(labels[0].sub.startsWith('Value: ▮220'));assert.match(labels[0].sub,/next journey.*sell/,'native admitted fresh core explains its fuel/sale choice');
 assert.equal(labels[1].sub,'Value: ▮0','spent core does not advertise a usable flight charge');net.broadcast('it',{e:'rm',id:choiceId});
 request('service');assert.equal(api.state().ready,false,'same HQ visit cannot repeatedly buy and remove service charges');
 game.run=JSON.parse(JSON.stringify(saves.at(-1)));assert.equal(api.state().serviceDebt,60,'saved service debt survives reload');
 request('service');assert.equal(api.state().ready,false,'reload does not reset HQ service receipt');

 const zone=company.interactables.find(i=>i.type==='sellzone'),bell=company.interactables.find(i=>i.type==='bell');
 player.pos.set(bell.pos.x,company.groundY??-1.25,bell.pos.z+1.4);player.inShip=false;physics.step(1/30);
 const first=game.items.hostSpawn('bolt',zone.pos.clone(),{value:30});
 net.request('bell');net.request('bell');assert.equal(timers.filter(t=>t.ms===2600).length,1,'duplicate bell does not add another native sale payout');flush();
 assert(!game.items.get(first));assert.equal(game.run.credits,0);assert.equal(game.run.sold,30,'full sale value counts toward quota');assert.equal(api.state().serviceDebt,30);
 assert.equal(sales.at(-1).fuelPaid,30);assert.equal(sales.at(-1).credit,0);
 net.broadcast('sell',{total:1000,credit:1000});assert.equal(api.state().serviceDebt,30,'replayed or unrelated result delivery cannot repay fuel debt');
 const second=game.items.hostSpawn('axle',zone.pos.clone(),{value:70});net.request('bell');flush();
 assert(!game.items.get(second));assert.equal(game.run.credits,40);assert.equal(game.run.sold,100);assert.equal(api.state().serviceDebt,0);
 assert.equal(sales.at(-1).fuelPaid,30);assert.equal(sales.at(-1).credit,40,'wallet receives actual sale less remaining service balance');
 const lastCore=game.items.hostSpawn('reactor',zone.pos.clone(),{value:200});net.request('bell');flush();
 assert(!game.items.get(lastCore),'last physical core remains voluntarily sellable');assert.equal(game.run.credits,240);assert.equal(game.run.sold,300);

 game.run.seed=18;game.world.seed=18;player.pos.set(5.3,.05,-2.3);player.inShip=true;physics.step(1/30);
 request('service');assert.equal(api.state().ready,true);assert.equal(game.run.credits,180);assert.equal(api.state().serviceDebt,0,'funded refuel charges existing team wallet');
 game.run.phase='orbit';game.run.moon='hamsi';game.hostLever('H');assert.equal(leverCalls,1,'emergency charge admits native next moon landing');assert.equal(api.state().ready,false);
 game.run.phase='moon';game.run.time=1440;game.world.moonId='hamsi';game.world.company=null;game.run.quota=130;game.run.sold=0;game.run.daysLeft=3;
 const objectives=Object.assign(Object.create(Objectives.prototype),{game});
 for(const lang of ['en','tr','ru']){
  setLang(lang);const lines=objectives.compute();assert(lines.some(l=>l.kind==='warn'),'night danger remains visible');
  assert(!lines.some(l=>/leaves at midnight|gece yarısı kalk|улетает в полночь/i.test(l.text)),'night does not invent automatic departure');
  game.run.departure38={seconds:8};assert(objectives.compute().some(l=>l.kind==='warn'&&/8/.test(l.text)),'only native manual departure shows a countdown');game.run.departure38=null;
 }
 setLang('en');
 game.run.time=480;game.world.outdoor={mainExit:{pos:new THREE.Vector3(20,0,0)}};
 assert.match(onegoal.shown(objectives.compute(),'standard')[0].text,/AIRLOCK/,'fresh empty-fuel arrival still teaches the first physical exit');
 net.players.set('P',{id:'P'});game.remotes.set('P',{pos:new THREE.Vector3(2,.05,0),dead:false});
 const crewCore=game.items.hostSpawn('reactor',new THREE.Vector3(2,1,0),{value:220,holder:'P'});
 assert.match(onegoal.shown(objectives.compute(),'standard')[0].text,/Core/,'known living crew fuel aboard is recognized before an emergency route');
 net.players.delete('P');
 assert.match(onegoal.shown(objectives.compute(),'standard')[0].text,/AIRLOCK/,'unknown holder cannot fabricate crew fuel aboard');
 net.broadcast('it',{e:'rm',id:crewCore});game.remotes.delete('P');game.world.outdoor=null;

 // Promotion uses an actual Session gs replica and the native HostMig rebuild.
 // This exercises promotion, not a network outage or human election prompt.
 game.run.phase='company';game.run.moon='hq';game.run.seed=19;game.world.moonId='hq';game.world.seed=19;game.world.company=company;game.run.credits=0;
 api.state().serviceDebt=Number.MAX_SAFE_INTEGER-10;request('remove');request('service');
 assert.equal(api.state().ready,true,'finite balance saturation must not strand a zero-credit crew');assert.equal(api.state().serviceDebt,Number.MAX_SAFE_INTEGER);
 game.run.seed=20;game.world.seed=20;game.run.credits=15;api.state().serviceDebt=0;
 request('remove');request('service');assert.equal(api.state().serviceDebt,45);
 const peerNet=new Session({strategy:'local',isHost:false,code:'loop39'});peerNet.selfId='P';peerNet.hostId='H';peerNet.connected=true;peerNet.players.set('H',{id:'H'});peerNet.players.set('P',{id:'P'});
 const peerMods=new Emitter(),peerTimers=[],peerPlayer={...player,id:'P',pos:player.pos.clone(),slots:[]};
 const peer={...game,net:peerNet,selfId:'P',mods:peerMods,player:peerPlayer,remotes:new Map(),run:{},_runSent:new Map(),hostData:null,config:{},opts:{},freshDayStats:()=>({collected:0,kills:0,deaths:[],startCredits:0,per:{}}),hostOnPlayerLeave(){},hostAnnounce(){},later(fn,ms){peerTimers.push({fn,ms});},hostSave(){},onItemHeld(){},onItemDropped(){}};
 Object.defineProperty(peer,'isHost',{get:()=>peerNet.isHost});peer.items=new ItemManager(peer);
 peerNet.on_('it',d=>peer.items.onEvent(d));peerNet.on_('gs',d=>Object.assign(peer.run,d));
 net.transport={peers:new Set(['P']),send(m,to){if(!to||to==='P')peerNet.receive(JSON.parse(JSON.stringify(m)),'H');},leave(){}};
 game.broadcastRun(Object.keys(game.run));net.flush();assert.equal(peer.run.reactor38.serviceDebt,45,'immediate native full keyframe carries unpaid fuel to successor');
 const peerApi=installReactor38(peer);peer.registerHandlers=()=>peerMods.emit('registerHandlers',(k,fn)=>peerNet.handle(k,fn),peer);
 const migration=installHostMig(peer);
 try{
  migration.becomeHost();assert(peerNet.isHost);assert.equal(peer.run.reactor38.serviceDebt,45);
  const restored=JSON.stringify(peer.run.reactor38);peerNet.request('reactor38',{...peerApi.receipt(),op:'service'});assert.equal(JSON.stringify(peer.run.reactor38),restored,'promotion cannot replay an already admitted service');
 }finally{migration.dispose();peerApi.dispose();peer.items.dispose();peerNet.transport.leave();peerNet.clear();}
 console.log('PASS HQ refuel physical/current-map/host guards, reentrant and stale receipts, finite debt, save, voluntary core sale, native sale wallet/quota, next landing, localized extraction cues and native promotion');
}finally{setLang('en');onegoal.dispose();companyApi.dispose();api.dispose();game.items.dispose();company.dispose(physics);net.transport.leave();net.clear();physics.dispose();}
