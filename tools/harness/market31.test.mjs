import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Session } from '../../src/net/session.js';
import { Physics, initPhysics } from '../../src/physics/physics.js';
import { ItemManager } from '../../src/entities/items.js';
import { defaultProfile } from '../../src/core/save.js';
import { UI } from '../../src/ui/ui.js';
import { installMarket31 } from '../../src/game/market31.js';
import { MARKET } from '../../src/game/progression.js';
import { hostMethods } from '../../src/game/host.js';

// Minimal DOM surface, real openMarket callback; no purchase outcome is injected.
class Node {
  children=[]; style={}; dataset={}; listeners=new Map(); isConnected=true;
  set innerHTML(v){this.children=[];} setAttribute(){} append(...v){this.children.push(...v);}
  appendChild(v){this.append(v);return v;} addEventListener(k,f){this.listeners.set(k,f);}
  getContext(){return new Proxy({}, {get:(_,k)=>k==='measureText'?()=>({width:10}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):k==='getImageData'||k==='createImageData'?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true});}
}
globalThis.document={createElement:()=>new Node(),createTextNode:t=>({textContent:t})};
globalThis.window=globalThis;window.requestIdleCallback=()=>{};
globalThis.localStorage={setItem(){},getItem(){return null;}};
await initPhysics();
const physics=new Physics();
physics.world.step();
const counter=new THREE.Vector3(0,1.4,0);
function game(id,host) {
  const profile=defaultProfile();profile.id=id+'-profile';profile.level=30;profile.coins=3000;profile.owned=[];profile.loadout.weapon=null;
  const net=new Session({isHost:host,profile,strategy:'local',code:'market31'});
  net.selfId=id;net.hostId='host';net.connected=true;
  const g={net,selfId:id,isHost:host,profile,physics,config:{inventorySlots:4},run:{phase:'company'},world:{company:{interactables:[{type:'market',pos:counter}]}},
    player:{pos:new THREE.Vector3(),slots:[null,null,null,null],dead:false},remotes:new Map(),engine:{scene:new THREE.Scene()},
    refreshStats(){},sfx(){},ui:{toast(){},hud:{setCoins(){}}},audio:{ui(){},play(){}},
    onItemHeld(it,holder){if(holder===id){const s=this.player.slots.indexOf(null);if(s>=0)this.player.slots[s]=it.id;}},onItemDropped(){}};
  g.broadcastRun=hostMethods.broadcastRun;g.items=new ItemManager(g);net.on_('it',d=>g.items.onEvent(d));
  net.on_('gs',d=>{g.run={...g.run,...d};});
  installMarket31(g);return g;
}
const host=game('host',true),peer=game('peer',false),games=[host,peer];
for(const g of games) for(const other of games) {
  g.net.players.set(other.selfId,{id:other.selfId,pid:other.profile.id,level:30});
  if(other!==g)g.remotes.set(other.selfId,{pos:other.player.pos,target:other.player.pos,level:30});
}
let holdReceipts=false,heldPackets=[],sentOrders=[];
for(const g of games)g.net.transport={peers:new Set([g===host?'peer':'host']),send(m,to){
  if(g===peer&&m.t==='req')sentOrders.push(m);
  const target=games.find(v=>v.selfId===to);
  if(g===host&&holdReceipts){heldPackets.push({m,to});return;}
  target?.net.receive(m,g.selfId);
}};
function pump(){for(let n=0;n<4;n++)for(const g of games)g.net.flush();}
const count=g=>[...g.items.all()].filter(it=>it.soulbound);
const p=host.profile;
let purchases=0;
const ui={panel:()=>new Node(),panelHead:()=>new Node(),panelFoot:()=>new Node(),button:(label,click,cls)=>Object.assign(new Node(),{label,click,className:cls}),openPanel(n){this.panelOpen=n;},closePanel(){},sfx(){},toast(){}};
const g=host;g.audio.ui=()=>purchases++;
UI.prototype.openMarket.call(ui,g);
function buttons(n){return [n,...(n.children||[]).flatMap(buttons)].filter(v=>v.click);}
await buttons(ui.panelOpen).find(v=>v.label==='Claim'||v.label==='Buy'||v.label?.startsWith('Buy ')).click();pump();
assert.equal(p.coins,2880,'Phish purchase must debit the existing wallet before success');
assert.equal(purchases,1);
assert.equal(count(host).length,1);assert.equal(count(host)[0].holder,'host');assert.equal(count(host)[0].state,'held');
assert.equal(p.loadout.weapon,'shovel');assert.ok(p.owned.includes('shovel'));

holdReceipts=true;
const nativeItem=host.net.msgHandlers.get('it');let replayedDuringSpawn=false;
const nativeReceipt=peer.net.msgHandlers.get('market31receipt');let ledgerBeforeReceipt=false;
peer.net.on_('market31receipt',(d,from)=> {
  if(from==='host' && d.ok && d.id==='machete')ledgerBeforeReceipt=!!peer.run.market31?.entries.some(e=>e.pid===peer.profile.id&&e.spent===350);
  nativeReceipt(d,from);
});
host.net.on_('it',(d,from)=> {
  nativeItem(d,from);
  if(d.e==='sp' && d.ty==='machete' && !replayedDuringSpawn) {
    replayedDuringSpawn=true;
    host.net.receive(sentOrders.find(m=>m.d.id==='machete'),'peer');
  }
});
const first=peer.market31.buy('machete'),second=peer.market31.buy('machete');assert.equal(first,second,'double click shares pending order');
pump();host.net.on_('it',nativeItem);assert.ok(replayedDuringSpawn,'real native spawn self-callback must replay the request');
assert.equal(peer.profile.coins,3000,'no success/debit before host receipt');
assert.equal(count(host).filter(it=>it.type==='machete').length,1);
// Local rewards earned while approval was in flight must survive its relative debit.
peer.profile.coins+=25;
holdReceipts=false;for(const {m,to}of heldPackets)games.find(g=>g.selfId===to).net.receive(m,'host');heldPackets=[];
assert.equal((await first).ok,true);assert.equal(peer.profile.coins,2675);
assert.ok(ledgerBeforeReceipt,'native gs ledger arrives before the approved receipt');
assert.equal(peer.profile.loadout.weapon,'machete');assert.equal(count(peer).filter(it=>it.type==='machete').length,1);
const oldOrder=sentOrders.find(m=>m.d.id==='machete');assert.ok(oldOrder);
host.net.receive(oldOrder,'peer');pump();assert.equal(peer.profile.coins,2675,'replayed receipt cannot debit twice');
assert.equal(count(host).filter(it=>it.type==='machete').length,1);
const replay=peer.market31.buy('machete');pump();assert.equal((await replay).reason,'owned');assert.equal(peer.profile.coins,2675);

host.profile.coins=1;
assert.equal((await host.market31.buy('sledge')).reason,'funds');assert.equal(host.profile.coins,1);assert.equal(count(host).length,2);
host.profile.coins=3000;host.profile.level=1;
assert.equal((await host.market31.buy('sledge')).reason,'level');host.profile.level=30;
host.player.pos.set(50,0,0);
assert.equal((await host.market31.buy('sledge')).reason,'blocked');host.player.pos.set(0,0,0);
const wall=physics.addStaticBox(0,1.4,-0.5,2,2,.1);counter.z=-1;physics.world.step();
assert.equal((await host.market31.buy('sledge')).reason,'blocked');physics.removeCollider(wall);counter.z=0;physics.world.step();
for(let i=0;i<3;i++)host.items.hostSpawn('flashlight',host.player.pos,{holder:'host'});
const prior=host.profile.coins;
assert.equal((await host.market31.buy('sledge')).reason,'full');assert.equal(host.profile.coins,prior);
// Nonphysical armor/perks/cosmetics use their real loadout/collection delivery.
assert.equal((await host.market31.buy('hardhat')).ok,true);assert.equal(host.profile.loadout.head,'hardhat');assert.equal(host.profile.coins,2850);
const cosmetic=MARKET.cosmetics.find(c=>c.id==='suit:purple'),cosmeticBefore=host.profile.coins;
assert.equal((await host.market31.buy(cosmetic.id)).ok,true);
const [cosmeticKind,cosmeticId]=cosmetic.id.split(':');
assert.ok(host.profile.cosmetics[cosmeticKind==='suit'?'suits':'hats'].includes(cosmeticId));
assert.equal(host.profile.coins,cosmeticBefore-cosmetic.coin);

// Lost acknowledgment: resume retries the same nonce and recovers one delivery.
holdReceipts=true;
const lost=peer.market31.buy('sledge');pump();assert.equal(count(host).filter(it=>it.type==='sledge').length,1);
heldPackets=[];peer.net.lost.set('host',{});
assert.equal((await peer.market31.buy('harpoon')).reason,'disconnected');
peer.net.lost.delete('host');holdReceipts=false;peer.net.emit('ready');pump();
assert.equal((await lost).ok,true);assert.equal(peer.profile.coins,2075);assert.equal(count(host).filter(it=>it.type==='sledge').length,1);
// A stale snapshot with a new nonce cannot replenish the host purchase ledger.
host.net.receive({t:'req',d:{...oldOrder.d,rid:'stale-new-order',id:'shotgun',profile:{...oldOrder.d.profile,coins:999999}}},'peer');pump();
assert.equal(count(host).filter(it=>it.type==='shotgun').length,0);
const insufficient=peer.market31.buy('shotgun');pump();assert.equal((await insufficient).reason,'funds');
// Native personal earnings after earlier purchases remain spendable this session.
peer.profile.coins+=500;
const earned=peer.market31.buy('shotgun');pump();assert.equal((await earned).ok,true);assert.equal(peer.profile.coins,75);
// Forged peer receipts never affect a pending request.
peer.profile.coins+=300;
holdReceipts=true;const pending=peer.market31.buy('vest');pump();
const vestOrder=sentOrders.find(m=>m.d.id==='vest');
peer.net.receive({t:'market31receipt',d:{rid:vestOrder.d.rid,id:'vest',ok:true,cost:200,kind:'armor'}},'rogue');
assert.ok(peer.market31.pending('vest'));assert.equal(peer.profile.loadout.body,null);
holdReceipts=false;for(const {m,to}of heldPackets)games.find(g=>g.selfId===to).net.receive(m,'host');heldPackets=[];
assert.equal((await pending).ok,true);
// Saved native run/profile receipt watermarks survive installer replacement,
// including a committed purchase whose acknowledgment never reached the peer.
peer.profile.coins+=2000;holdReceipts=true;
const beforeLost=peer.profile.coins,unseen=peer.market31.buy('kevlar');pump();
const committed=JSON.parse(JSON.stringify(host.run));
const oldRid=sentOrders.find(m=>m.d.id==='kevlar').d.rid;
assert.ok(committed.market31.entries.some(e=>e.pid===peer.profile.id));
peer.market31.dispose();assert.equal((await unseen).reason,'stopped');
host.market31.dispose();host.run=committed;heldPackets=[];holdReceipts=false;
installMarket31(host);installMarket31(peer);
const recovered=peer.market31.buy('kevlar');pump();
assert.equal((await recovered).ok,true);assert.equal(peer.profile.coins,beforeLost-900);
assert.equal(peer.profile.loadout.body,'kevlar');
const newRid=sentOrders.filter(m=>m.d.id==='kevlar').at(-1).d.rid;assert.notEqual(newRid,oldRid);
assert.ok(host.run.market31.entries.some(e=>e.pid===host.profile.id),'other stored profile ledger survives lazy reconstruction');
const afterRecovery=peer.profile.coins;
host.net.receive({t:'req',d:{...sentOrders.find(m=>m.d.id==='kevlar').d}},'peer');pump();
assert.equal(peer.profile.coins,afterRecovery,'old committed request cannot charge again after installer replacement');
// Starting a new native run resets its approval ledger without reapplying the
// preceding run's spend watermark or accepting delayed old-run receipts.
host.run={phase:'company',runId:'next-market-run'};peer.run={phase:'company',runId:'next-market-run'};
const beforeNew=peer.profile.coins,newBuy=peer.market31.buy('lucky');pump();
assert.equal((await newBuy).ok,true);assert.equal(peer.profile.coins,beforeNew-600);assert.equal(peer.profile.loadout.perk,'lucky');
peer.net.receive({t:'market31state',d:{runId:'market31',spent:999999,p:host.run.market31.entries[0].p,receipts:[]}},'host');
host.net.receive(oldOrder,'peer');pump();assert.equal(peer.profile.coins,beforeNew-600);
// Migration immediately after a receipt: the promoted host gets a fresh
// service using its last native gs replica, without waiting a generic 1s sync.
const migrationReplica=JSON.parse(JSON.stringify(peer.run));
assert.ok(migrationReplica.market31?.entries.some(e=>e.pid===peer.profile.id&&e.spent===600),'approval ledger must reach successor before purchase receipt');
host.net.isHost=false;host.net.hostId='peer';host.isHost=false;
peer.net.isHost=true;peer.net.hostId='peer';peer.isHost=true;peer.run=migrationReplica;
installMarket31(peer);installMarket31(host);
const beforeMigration=peer.profile.coins;
const migrationBuy=peer.market31.buy('hardhat');pump();
assert.equal((await migrationBuy).ok,true);assert.equal(peer.profile.coins,beforeMigration-150);
// A late join/migration fixture can lack historical market state while the
// native saved profile already acknowledges its old purchases. Seeding that
// watermark must preserve current money, not reject all future purchases.
delete peer.run.market31;installMarket31(peer);
const beforeAbsent=peer.profile.coins,absentLedgerBuy=peer.market31.buy('hat:cone');pump();
assert.equal((await absentLedgerBuy).ok,true);assert.equal(peer.profile.coins,beforeAbsent-60);
// Explicit native delivery-failure fault: a self-delivered item callback removes
// the spawned object locally after its spawn was queued for the other peer.
// Rollback must still remove the remote copy and leave the wallet untouched.
peer.profile.coins+=2000;
const beforeFault=peer.profile.coins,faultNative=peer.net.msgHandlers.get('it');let faulted=false;
peer.net.on_('it',(d,from)=> {
  faultNative(d,from);
  if(d.e==='sp' && d.ty==='harpoon') {faulted=true;peer.items.onEvent({e:'rm',id:d.id});}
});
const failedDelivery=peer.market31.buy('harpoon');pump();peer.net.on_('it',faultNative);
assert.equal((await failedDelivery).reason,'delivery');assert.ok(faulted);
assert.equal(peer.profile.coins,beforeFault);assert.ok(!peer.profile.owned.includes('harpoon'));
assert.equal(count(host).filter(it=>it.type==='harpoon').length,0,'failed native delivery must remove queued remote spawn even when the local item is already gone');
for(const g of games){g.market31.dispose();g.items.clearAll();g.items.dispose();}physics.dispose();
console.log('market31 native UI, host/peer receipt, debit/delivery, double click/replay, funds/level/range/LOS/full, reward preservation, reconnect and forged/stale response PASS');
