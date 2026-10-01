import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
globalThis.window=globalThis;globalThis.addEventListener=globalThis.removeEventListener=()=>{};
globalThis.document={getElementById:()=>null,createElement:()=>({style:{},remove(){}}),head:{appendChild(){}},body:{appendChild(){}}};
const THREE=await import('three');
const {actionMethods}=await import('../../src/game/actions.js');
const {createRpsClient}=await import('../../src/game/arcade_rps_ui.js');
const {installCoop12}=await import('../../src/game/coop12.js');
const {installTrade}=await import('../../src/game/trade.js');
const {t,tf}=await import('../../src/core/i18n.js');globalThis.t=t;globalThis.tf=tf;
const hooks=new Map(),items=new Map();let cabin=true,rayHit=null,selected=0;
const g={selfId:'a',isHost:true,time:0,run:{phase:'moon',moon:'hamsi'},
 player:{pos:new THREE.Vector3(),yaw:0,dead:false,indoor:true,heldItem:()=>null},
 camera:{position:new THREE.Vector3(0,1.2,0),quaternion:new THREE.Quaternion()},
 remotes:new Map([['b',{id:'b',name:'Peer',pos:new THREE.Vector3(0,0,-1.5),yaw:Math.PI,dead:false}]]),
 world:{facility:{doors:[]}},descent21:{controlsActive:()=>cabin},physics:{raycast:()=>rayHit},
 items:{get:id=>items.get(id),all:()=>items.values()},playerName:()=> 'Peer',
 mods:{chatCommands:new Map(),on(k,fn){const list=hooks.get(k)||[];list.push(fn);hooks.set(k,list);return()=>hooks.set(k,list.filter(v=>v!==fn));},emit(k,...args){for(const fn of hooks.get(k)||[])fn(...args);}},
 net:{on_(){},off(){},request(){},broadcast(){}},ui:{toast(){}},audio:{},engine:{},
 carriedBody:()=>null,pickup:()=>selected++,grab:{start:()=>selected++},doorInteraction:()=>({label:'Open door',action:()=>selected++})};
const rps=createRpsClient({game:g,request(){},isHost:()=>true}),coop=installCoop12(g),trade=installTrade(g);
const lift={pos:new THREE.Vector3(0,1.2,-2),r:.3,reach:2.4,label:'CALL LIFT',action:()=>selected++};
const invitations=()=>{const out=[];rps.interactables(out);g.mods.emit('interactables',out,g);return out;};
const all=invitations();assert.equal(all.length,3,'all three actual native optional peer producers active');assert(all.every(ip=>ip.optionalPeer===true));
// Test each competing native producer separately, plus all together. Its generous
// radius/nearer score otherwise eclipses the physical console.
for(const optional of [...all,all]){
 const peers=Array.isArray(optional)?optional:[optional];g.interactablesNow=()=>[lift,...peers];
 cabin=true;const target=actionMethods.findInteraction.call(g);assert.equal(target.label,'CALL LIFT');target.action();
 cabin=false;assert.notEqual(actionMethods.findInteraction.call(g).label,'CALL LIFT','outside cabin optional peer actions remain selectable');
}
cabin=true;g.interactablesNow=()=>[lift,...all,{pos:new THREE.Vector3(0,1.2,-1),r:.4,label:'HOLD E TO REVIVE',action:()=>selected++}];
assert.equal(actionMethods.findInteraction.call(g).label,'HOLD E TO REVIVE','essential rescue remains selectable');
g.interactablesNow=()=>[lift,...all,{pos:new THREE.Vector3(0,1.2,-1),r:.4,label:'NPC commerce',action(){}}];
assert.equal(actionMethods.findInteraction.call(g).label,'NPC commerce','NPC commerce is not classified by label or generic social category');
rayHit={distance:1,info:{kind:'door',door:{}}};assert.equal(actionMethods.findInteraction.call(g).label,'Open door','native door ray has priority unchanged');
for(const [id,type,def,expected] of [['body','body',{},'Carry body'],['heavy','heavy',{kind:'big',name:'Heavy cargo'},'Grab Heavy cargo']]){
 items.set(id,{id,type,state:'world',def,value:30});rayHit={distance:1,info:{kind:'item',itemId:id}};
 const target=actionMethods.findInteraction.call(g);assert(target.label.startsWith(expected),'native body/heavy carry remains selectable');target.action();
}
assert.equal(selected,6);trade.dispose();coop.dispose();rps.dispose();
console.log('descent21 focus: PASS (native selector + installed RPS/high-five/trade; rescue, cargo, doors and NPC commerce preserved)');
