// Native Fleet panel/host/UI lifecycle with a small DOM boundary fixture.
// Geometry is the production SVG helper; this does not claim browser rendering.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { UI } from '../../src/ui/ui.js';
import { Emitter } from '../../src/core/events.js';
import { setLang } from '../../src/core/i18n.js';
import { installFleet13 } from '../../src/game/fleet13.js';
import { FLEET13, fleetLayout, sanitizeFleet13 } from '../../src/game/fleet13_core.js';
import { fleetPreview13 } from '../../src/game/fleet13_preview.js';
import { HUB13_BROKER, HUB13_BOARD } from '../../src/world/hub13.js';

class Node extends EventTarget {
  constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.attrs={};this.classes=new Set();}
  set className(v){this.classes=new Set(String(v).split(/\s+/).filter(Boolean));}get className(){return [...this.classes].join(' ');}
  classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),contains:v=>this.classes.has(v)};
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=v;}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}appendChild(n){this.append(n);return n;}
  set innerHTML(v){this.html=String(v);for(const n of this.children)n.parent=null;this.children=[];}get innerHTML(){return this.html||'';}
  get isConnected(){return this.root||!!this.parent?.isConnected;}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
}
const doc=globalThis.document={createElement(tag){assert.notEqual(tag,'canvas','fleet preview must not create a renderer/canvas');return new Node(tag);},createTextNode(text){const n=new Node('#text');n.text=String(text);return n;},documentElement:new Node('html')};
doc.body=new Node('body');doc.body.root=true;
function find(n,p){if(p(n))return n;for(const c of n.children){const v=find(c,p);if(v)return v;}return null;}
const overlays=new Node();doc.body.append(overlays);let locks=0,unlocks=0;
const game={opts:{deadletter:true},isHost:true,selfId:'host',time:0,profile:{shipyard:{}},run:{phase:'orbit',credits:60,fleet13:sanitizeFleet13()},
 player:{pos:new Vector3(...HUB13_BROKER),dead:false,downed:false,inShip:false},world:{moonId:'__relay13'},mods:new Emitter(),remotes:new Map([['crew',{pos:new Vector3(...HUB13_BROKER)}]]),
 ship:{spawns:[new Vector3(),new Vector3(1,0,0)],door:{setOpen(){}}},objectives:{compute(){return[];}},broadcastRun(){},hostSave(){},loadMapFor(){this.world.moonId='hamsi';}};
const ui=Object.create(UI.prototype);Object.assign(ui,{app:{game,input:{lock(){locks++;},unlock(){unlocks++;}}},overlay:overlays,panelOpen:null,padActive:false,sfx(){},toast(){}});game.ui=ui;
const handlers=new Map(),requests=[],sent=[];game.net={request(k,d){requests.push({k,d});handlers.get(k)?.(d,'host');},sendTo(id,k,d){sent.push({id,k,d});}};
setLang('en');const fleet=installFleet13(game);game.mods.emit('registerHandlers',(k,fn)=>handlers.set(k,fn),game);
const card=id=>find(ui.panelOpen,n=>n.attrs['data-vessel']===id);
const preview=id=>find(card(id),n=>n.classList.contains('fleet13-preview'));
const buy=id=>find(card(id),n=>n.tagName==='BUTTON');
fleet.open();assert.equal(unlocks,1);assert.match(game.objectives.compute()[0].text,/^Claim a free ship/);
assert.equal(Object.keys(FLEET13).length,4);for(const [id,d]of Object.entries(FLEET13)){
 assert.equal(preview(id).innerHTML,fleetPreview13(fleetLayout(id),d.name));assert.match(preview(id).innerHTML,/role="img"/);
 assert.equal(buy(id).disabled,id!=='courier','native crew credits restrict purchases');
}
assert.equal(new Set(Object.keys(FLEET13).map(id=>preview(id).innerHTML)).size,4,'different fitted hulls have different visual geometry');
const oldPanel=ui.panelOpen,oldPreview=preview('courier');buy('hauler').click();assert.equal(requests.length,0);buy('courier').click();
assert.equal(game.run.fleet13.selected,'courier');assert.equal(game.run.credits,60);assert.equal(ui.panelOpen,null);assert.equal(oldPanel.isConnected,false);assert.equal(oldPreview.isConnected,false);assert.equal(locks,1);
fleet.open();assert.equal(card('courier').attrs['aria-current'],'true');assert.equal(buy('courier').disabled,true);assert.match(game.objectives.compute()[0].text,/^Board Packet Courier/);
game.run.fleet13.owned.courier.m={N1:{id:'lab',t:2}};game.run.fleet13.owned.courier.paint.c1='red';fleet.open();
assert.match(preview('courier').innerHTML,/data-part="N1:lab"/);assert.match(preview('courier').innerHTML,/#b02a22/,'saved fitted layout and paint override brochure preset');
let handoffs=0;ui.onPanelClose=()=>{handoffs++;return true;};const beforeLocks=locks;fleet.open();assert.equal(handoffs,1,'native panel replacement honors one close callback');assert.equal(locks,beforeLocks);
game.isHost=false;fleet.open();for(const id of Object.keys(FLEET13)){assert.equal(buy(id).disabled,true);buy(id).click();}assert.equal(requests.length,1,'crew can inspect all ships without buying');
game.isHost=true;game.run.credits=1000;game.player.dead=true;fleet.open();for(const id of Object.keys(FLEET13))assert.equal(buy(id).disabled,true);game.player.dead=false;game.player.downed=true;fleet.open();for(const id of Object.keys(FLEET13))assert.equal(buy(id).disabled,true);game.player.downed=false;
game.opts.deadletter=false;fleet.open();assert.doesNotMatch(game.objectives.compute()[0].text,/Dead Letter Run/);buy('hauler').click();assert.equal(game.run.credits,480);assert.equal(game.run.fleet13.selected,'hauler');
game.player.pos.set(...HUB13_BOARD);fleet.request('board');assert.equal(fleet.docked(),false);assert.deepEqual(sent.map(x=>x.id),['host','crew'],'native dispatch still includes the crew');
for(let i=0;i<20;i++){fleet.open();const p=preview('hauler');ui.closePanel();assert.equal(p.isConnected,false);}
const escaped=fleetPreview13(fleetLayout('courier'),'"<script>bad</script>');assert.doesNotMatch(escaped,/<script>/);assert.match(escaped,/&lt;script&gt;/);assert.equal(escaped,fleetPreview13(fleetLayout('courier'),'"<script>bad</script>'),'illustration is deterministic');
const large=fleetLayout('survey');large.m.N3={id:'medbay',t:3};large.m.N4={id:'bunk',t:3};const svg=fleetPreview13(large,'Extended');assert.doesNotMatch(svg,/NaN|Infinity|<image|<foreignObject|<animate/);assert.ok(svg.length<60000,'bounded room/face count');assert.match(svg,/data-part="N3:medbay"/);
ui.closePanel();fleet.dispose();assert.equal(ui.panelOpen,null);assert.equal(overlays.children.length,0);
console.log('fleet30: actual panel illustrations, saved geometry/paint, selected state, host/credit/death restrictions, mode goal, native close/replacement and crew dispatch pass; SVG owns no canvas/frame/resources.');
