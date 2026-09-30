// Construct the real fresh-profile panel through the installed RPG keyboard handler; no free points/ranks.
import assert from 'node:assert/strict';
import * as K from '../../src/game/onboard_core.js';
import { installRpg } from '../../src/game/rpg.js';
const saved={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame};
const keys=new Map();
const ctx=new Proxy({measureText:()=>({width:20})},{get:(o,k)=>k in o?o[k]:()=>({addColorStop(){}})});
const node=()=>({children:[],style:{setProperty(k,v){this[k]=v;}},classList:{add(){},remove(){},toggle(){}},replaceChildren(...items){this.children=[...items];},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},addEventListener(){},removeEventListener(){},remove(){},focus(){},setAttribute(){},getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})});
globalThis.document={createElement:node,createTextNode:text=>({textContent:text}),getElementById:()=>null,head:node()};
globalThis.window={addEventListener:(ev,fn)=>keys.set(ev,[...(keys.get(ev)||[]),fn]),removeEventListener:(ev,fn)=>keys.set(ev,(keys.get(ev)||[]).filter(x=>x!==fn))};
globalThis.requestAnimationFrame=()=>1;
let denied=0;
const game={profile:{level:1,skillPoints:0,coins:0},run:{phase:'orbit',quotaIndex:0},settings:{keys:{skillTree:'KeyJ'}},player:{update(){}},input:{isTyping:()=>false},onboard:{deny(id){denied++;const u=K.ensureUnlocks(game.profile);K.decideMode(game.profile);return K.isLockedId(id,u,K.progressOf(game.run,u),false);}},refreshStats(){},progress:{save(){}},ui:{panelOpen:null,openPanel(el){this.panelOpen=el;},closePanel(){this.panelOpen=null;}}};
try {
 const rpg=installRpg(game);let prevented=0;
 const press=extra=>{const event={code:'KeyJ',target:{tagName:'CANVAS'},preventDefault(){prevented++;},...extra};for(const fn of [...keys.get('keydown')])fn(event);};
 press({repeat:true});assert.equal(game.ui.panelOpen,null);
 press({target:{tagName:'INPUT'}});assert.equal(game.ui.panelOpen,null);
 press({});assert.equal(denied,1,'installed hotkey consults the central access policy');assert.equal(prevented,1);assert.equal(game.ui.panelOpen.className,'pt');
 assert.ok(game.ui.panelOpen.children.some(child=>child.children.some(n=>n.className==='pt-canvas')),'the actual full tree canvas is constructed');
 assert.equal(game.profile.skillPoints,0);assert.deepEqual(game.profile.rpg.nodes,[]);
 rpg.close();assert.equal(rpg.setRole('scout'),true,'role basics remain available in a fresh dock/orbit');assert.equal(rpg.allocate('scout_s1').ok,false,'zero points cannot allocate paid ranks');assert.equal(game.profile.skillPoints,0);assert.deepEqual(game.profile.rpg.nodes,[]);
 rpg.dispose();
} finally {for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
console.log('treeaccess18: fresh remapped hotkey constructs real panel; progression costs and input guards preserved');
