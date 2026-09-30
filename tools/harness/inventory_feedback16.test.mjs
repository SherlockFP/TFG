import assert from 'node:assert/strict';
import {createInventoryFeedback16} from '../../src/game/inventory_feedback16.js';
import {installLoaner,loanerNeed} from '../../src/game/loaner.js';
import {Emitter} from '../../src/core/events.js';
const copper={id:'copper',value:30,type:'copper',holder:'me',state:'held',inv:{k:'bag'},def:{kind:'scrap',name:'Copper'}};
const torch={id:'torch',type:'flashlight',state:'held',holder:'me',battery:10,def:{kind:'tool',name:'Flashlight'}};
const all=[copper,torch],toasts=[],drops=[];
const game={selfId:'me',player:{pos:{x:0,y:0,z:0},slots:['torch',null,null,null],heldItem(){return all.find(it=>it.id===this.slots[0]);}},settings:{keys:{inventory:'KeyB',drop:'KeyH',hotbar2:'Digit7'}},items:{all:()=>all},ui:{toast:m=>toasts.push(m)},dropHeld(){drops.push(this.player.heldItem()?.id);}};
const original=game.dropHeld,api=createInventoryFeedback16(game);
assert.equal(api.location({id:'pending'}),'Carrying','unassigned held item cannot imply Hotbar 0');
api.confirmed({...copper,id:'free-kit',value:0});api.confirmed({...copper,id:'soul',soulbound:true});api.confirmed({...copper,id:'body',type:'body'});api.confirmed({...copper,id:'remote',holder:'friend'});assert.equal(toasts.length,0,'remote, zero-value gifts, bound gear and bodies are not extraction salvage');
assert.equal(api.confirmed(copper),true); assert.match(api.feedHint(copper),/\[B\].*right-click.*\[H\]/);assert.equal(toasts.length,0);assert.equal(game.player.slots[0],'torch','feedback cannot displace selected gear');
assert.equal(api.confirmed(copper),false);assert.equal(toasts.length,0,'duplicate host-held replay is quiet');
game.dropHeld();assert.deepEqual(drops,['torch'],'drop remains native selected tool');assert.match(toasts.at(-1),/Salvage.*bag/);
game.dropHeld();assert.equal(toasts.length,1,'drop reminder bounded');
copper.inv=null;game.player.slots[1]='copper';api.changed();assert.match(toasts.at(-1),/hotbar 2.*\[7\]/);assert.equal(game.player.slots[0],'torch');
copper.value=0;copper.inv={k:'bag'};game.player.slots[1]=null;const quiet=createInventoryFeedback16(game);const count=toasts.length;game.dropHeld();assert.equal(toasts.length,count,'zero-value bag item must not trigger drop reminder');quiet.dispose();
api.dispose();assert.equal(game.dropHeld,original,'lifecycle restores hook');
copper.value=30;
const mods=new Emitter(),spawned=[],sent=[];
Object.assign(game,{mods,isHost:true,remotes:new Map([['friend',{}]]),world:{facility:{}},onboard:{fr:{stage:()=> 'fresh'}},net:{broadcast:(...a)=>sent.push(a)}});
game.items.hostSpawn=(type,pos,opts)=>{const id=`loan${spawned.length}`;spawned.push({id,type,pos,opts});return id;};game.items.get=id=>spawned.find(i=>i.id===id);
assert.equal(loanerNeed(game),1,'charged carried purchased torch excludes one crew loan');
torch.battery=0;assert.equal(loanerNeed(game),2,'exhausted light still needs assistance');
const floor={id:'floor',type:'proflash',state:'world',battery:20,obj:{position:{x:0,y:0,z:0}}};all.push(floor);assert.equal(loanerNeed(game),1,'available charged ship-floor torch covers one missing crew');
const loan=installLoaner(game);mods.emit('phase','landing',game);mods.emit('phase','moon',game);assert.equal(spawned.length,1);assert.equal(spawned[0].opts.battery,70);assert.equal(sent.filter(x=>x[0]==='sys').length,1);
mods.emit('phase','takeoff',game);assert.equal(sent.filter(x=>x[1]?.e==='rm').length,1,'only temporary loan is removed');
torch.battery=30;mods.emit('phase','landing',game);mods.emit('phase','moon',game);assert.equal(spawned.length,1,'adequately lit crew receives no redundant loan');assert.equal(sent.filter(x=>x[0]==='sys').length,1,'no false floor-loan announcement');
loan.dispose();console.log('inventory feedback and conditional loaner tests passed');

// Actual installed inventory held-event path renders guidance immediately, without the toast queue.
const { installInventory } = await import('../../src/game/inventory.js');
const oldWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
const oldDoc=globalThis.document, oldTimeout=globalThis.setTimeout, oldInterval=globalThis.setInterval;
const nodes=[],timers=[];
const node=()=>{const e={children:[],dataset:{},isConnected:true,style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false;}},querySelector(){return null;},querySelectorAll(){return [];},appendChild(child){child.parent=this;this.children.push(child);},insertBefore(child){this.appendChild(child);},remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);},get firstChild(){return this.children[0];}};nodes.push(e);return e;};
const uiRoot=node();
globalThis.document={head:node(),body:node(),createElement:node,getElementById:id=>id==='ui'?uiRoot:null};globalThis.setTimeout=(fn,ms)=>{timers.push([fn,ms]);return timers.length;};globalThis.setInterval=()=>1;
try {
 copper.inv={k:'bag'};copper.rarity=()=> 'common';copper.value=30;
 const inventory=installInventory(game);const before=toasts.length;
 inventory.onHeld(copper,{h:'me'});
 const feed=nodes.find(n=>n.dataset.dockId==='tfg-inv-feed');assert.ok(uiRoot.children.some(d=>d.children.includes(feed)),'real hudDock mounts feed under #ui, matching threat selector');assert.equal(feed.children.length,1);assert.match(feed.children[0].innerHTML,/tinv-feed-hint.*\[B\].*right-click.*\[H\]/);assert.equal(toasts.length,before);
 inventory.onHeld(copper,{h:'me'});assert.equal(feed.children.length,1,'duplicate confirmed replay creates no second feed');
 inventory.onItemEvent({e:'drop',id:'copper'});inventory.onHeld(copper,{h:'me'});assert.equal(feed.children.length,2,'authoritative drop permits same-location genuine pickup feedback');
 inventory.onHeld(copper,{h:'friend'});inventory.onHeld(copper,{h:'me'});assert.equal(feed.children.length,3,'remote custody transfer resets local feedback cache');
 inventory.onItemEvent({e:'rm',id:'copper'});inventory.onHeld(copper,{h:'me'});assert.equal(feed.children.length,4,'authoritative removal also clears cached feedback');
 assert.deepEqual(timers.filter(t=>t[1]===3600||t[1]===4200).map(t=>t[1]),[3600,4200,3600,4200,3600,4200,3600,4200]);
 game.run={phase:'moon',escape14:{result:'active',warden:'w',target:'me'}};game.creatures={host:new Map([['w',{state:'chase',target:'me'}]])};
 const underThreat={...copper,id:'danger-scrap'};inventory.onHeld(underThreat,{h:'me'});assert.ok(!feed.children.at(-1).innerHTML.includes('tinv-feed-hint'));assert.match(toasts.at(-1),/bag/);
 inventory.dispose();
} finally {if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;globalThis.setTimeout=oldTimeout;globalThis.setInterval=oldInterval;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}

const { readFileSync } = await import('node:fs');
assert.match(readFileSync(new URL('../../src/ui/theme.css',import.meta.url),'utf8'), /#ui:has\(\.hud\.hud-alert-focus\) \.tinv-feed-hint\s*\{\s*display:none/,'existing danger class suppresses teaching text even when pickup predates threat');
