import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c);}"));

// Explicit DOM/canvas recording fixtures. Real HUD and ShipScreens methods,
// real item definitions/icons/durability/locale; no WebGL or FPS inference.
class Canvas28 {
 constructor(canvas){this.canvas=canvas;this.clears=0;this.text=[];}
 fillRect(x,y,w,h){if(x===0&&y===0&&w===this.canvas.width&&h===this.canvas.height){this.clears++;this.text=[];}}
 fillText(s,x,y){this.text.push([String(s),this.fillStyle,this.font,x,y]);}
 strokeRect(){} beginPath(){} arc(){} save(){} restore(){} translate(){} rotate(){} moveTo(){} lineTo(){} closePath(){} fill(){} stroke(){} arcTo(){} strokeText(){}
}
let mutations28=0;
class Node28 {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners=new Map();this.htmlWrites=0;this._html='';this.ctx=this.tagName==='CANVAS'?new Canvas28(this):null;this._classes=new Set();this.classList={add:(...s)=>{mutations28++;s.forEach(x=>this._classes.add(x));},remove:(...s)=>{mutations28++;s.forEach(x=>this._classes.delete(x));},contains:s=>this._classes.has(s),toggle:(s,on)=>{mutations28++;on??=!this._classes.has(s);on?this._classes.add(s):this._classes.delete(s);return on;}};}
 set className(s){mutations28++;this._classes=new Set(String(s).split(/\s+/));} get className(){return[...this._classes].join(' ');}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=v;}
 appendChild(c){mutations28++;if(c.parentNode)c.remove();c.parentNode=this;this.children.push(c);return c;} append(...c){for(const x of c)this.appendChild(x);}
 remove(){if(this.parentNode){mutations28++;this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}}
 addEventListener(k,fn){this.listeners.set(k,fn);} dispatchEvent(e){this.listeners.get(e.type)?.(e);}
 get innerHTML(){return this._html;} set innerHTML(s){mutations28++;this.htmlWrites++;this._html=String(s);for(const c of this.children)c.parentNode=null;this.children=[];const stack=[this],tags=/<\/?([a-z][\w:-]*)\b([^>]*)>/gi;let m;while((m=tags.exec(this._html))){if(m[0].startsWith('</')){if(stack.length>1)stack.pop();continue;}const n=new Node28(m[1]);for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)){n.attributes[a[1]]=a[2];if(a[1]==='class')n._classes=new Set(a[2].split(/\s+/));if(a[1].startsWith('data-'))n.dataset[a[1].slice(5)]=a[2];}const parent=stack.at(-1);n.parentNode=parent;parent.children.push(n);if(!['IMG','INPUT','BR','HR','PATH','USE'].includes(n.tagName)&&!m[2].trim().endsWith('/'))stack.push(n);}}
 set textContent(s){mutations28++;this._text=String(s);for(const c of this.children)c.parentNode=null;this.children=[];} get textContent(){return(this._text||'')+this.children.map(c=>c.textContent).join('');}
 getContext(kind){return kind==='2d'?this.ctx:null;} toDataURL(){return 'data:image/png;base64,Zml4dHVyZTI4';}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
 querySelectorAll(sel){const matches=n=>sel.startsWith('.')?n._classes.has(sel.slice(1)):n.tagName===sel.toUpperCase();const out=[];function walk(n){for(const c of n.children){if(matches(c))out.push(c);walk(c);}}walk(this);return out;}
}
const previous={document:globalThis.document,window:globalThis.window,KefalAPI:globalThis.KefalAPI,fetch:globalThis.fetch,localStorage:globalThis.localStorage};
let releaseFonts;const fontReady=new Promise(resolve=>{releaseFonts=resolve;});const fontListeners=new Map(),idle=[];
globalThis.document={baseURI:new URL('../../public/',import.meta.url).href,createElement:tag=>new Node28(tag),createTextNode:s=>{const n=new Node28('span');n.textContent=s;return n;},head:new Node28('head'),body:new Node28('body'),documentElement:new Node28('html'),querySelectorAll:()=>[],getElementById:id=>document.head.children.find(n=>n.id===id)||null,fonts:{load:()=>fontReady,ready:fontReady,addEventListener:(name,fn)=>fontListeners.set(name,fn)}};
const saved28=new Map();globalThis.localStorage={getItem:key=>saved28.get(key)||null,setItem:(key,v)=>saved28.set(key,String(v))};
globalThis.window={requestIdleCallback:fn=>idle.push(fn),__kefalMods:{}};
const THREE=await import('three');
const {ShipScreens}=await import('../../src/game/screens.js');
const {HUD}=await import('../../src/ui/hud.js');
const {itemDef}=await import('../../src/game/items.js');
const {setLang}=await import('../../src/core/i18n.js');
const {ModManager}=await import('../../src/mods/modapi.js');
setLang('en');
const tests=[],failures=[],counts={};
const test=async(name,fn)=>{tests.push(name);try{await fn();}catch(e){failures.push(`${name}: ${e.message}`);}};
function screens(){
 const mesh=()=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());
 const anchors={terminal:{userData:{anchors:{screen:mesh()}}},monitors:{userData:{anchors:{screens:[mesh(),mesh(),mesh()]}}},quota:{userData:{anchors:{screen:mesh()}}},arcade:{userData:{anchors:{screen:mesh()}}}};
 const cargo=[{def:itemDef('bolt'),value:30,soulbound:false}];
 const game={ship:{anchors},camera:{position:new THREE.Vector3()},terminal:{lines:[]},selfId:'self',profile:{name:'Crew'},player:{pos:new THREE.Vector3(),yaw:0,hp:100,dead:false},remotes:new Map(),world:{},creatures:{views:new Map()},items:{all:()=>cargo,inShipItems:()=>cargo},run:{phase:'orbit',moon:'hamsi',sold:0,quota:130,daysLeft:3,day:1,credits:60,time:481.8}};
 const s=new ShipScreens(game);s.drawArcade=ctx=>ctx.fillRect(0,0,128,96);return{s,game,cargo};
}
const paints=s=>({status:s.status.ctx.clears,quota:s.quota.ctx.clears,extra:s.extra.ctx.clears,radar:s.radar.ctx.clears,arcade:s.arcade.ctx.clears});
const sameAsDirect=(s,name)=>{const panel=s[name],before=structuredClone(panel.ctx.text);s[name==='status'?'drawStatus':'drawQuota']();assert.deepEqual(panel.ctx.text,before,'cached refresh matches actual direct drawing');};
await test('existing screen text, placement, colours and fonts are retained',()=>{
 const {s}=screens();s.update(.2);assert.deepEqual(s.status.ctx.text,[['SHIP STATUS','#7fd1ff','11px "TFG Credit", monospace',8,14],...['MOON: Dialup','PHASE: ORBIT','LOOT ONBOARD: ▮30','CREDITS: ▮60','CREW: 1'].map((text,i)=>[text,'#e8f4ff','11px "TFG Credit", monospace',8,[32,46,64,80,96][i]])]);assert.deepEqual(s.quota.ctx.text,[['ENGAGEMENT QUOTA','#ffb347','bold 13px "TFG Credit", monospace',10,18],['▮0 / ▮130','#ffd9a0','bold 18px "TFG Credit", monospace',10,44],['DEADLINE: 3 DAYS','#ffb347','12px "TFG Credit", monospace',10,66],['DAY 1','#ffb347','12px "TFG Credit", monospace',10,84]]);
});
await test('missing optional screen anchors do no status or quota work',()=>{
 const {s,game}=screens();s.status=null;s.quota=null;let walks=0;game.items.inShipItems=()=>{walks++;return[];};s.quotaRows=()=>{throw Error('missing quota was evaluated');};s.update(.2);s.drawStatus();s.drawQuota();assert.equal(walks,0);
});
await test('unchanged ship screens avoid canvas redraws and version changes',()=>{
 const {s}=screens();const versions={status:s.status.t.version,quota:s.quota.t.version};for(let i=0;i<20;i++)s.update(.2);counts.ship=paints(s);
 assert.equal(counts.ship.status,1);assert.equal(counts.ship.quota,1);assert.equal(s.status.t.version-versions.status,1);assert.equal(s.quota.t.version-versions.quota,1);
 assert.equal(counts.ship.radar,20);assert.equal(counts.ship.arcade,20);assert.equal(counts.ship.extra,20);
});
await test('every displayed status and quota change repaints exactly once',()=>{
 const {s,game,cargo}=screens();s.update(.2);
 for(const [panel,change]of[
  ['status',()=>cargo[0].value++],['status',()=>cargo[0].soulbound=true],['status',()=>game.run.credits++],['status',()=>game.run.phase='moon'],['status',()=>game.run.moon='lufer'],['status',()=>game.remotes.set('crew',{name:'Guest',hp:75,dead:false,pos:new THREE.Vector3(),yaw:0})],['status',()=>game.run.time=483.2],
  ['quota',()=>game.run.sold=130],['quota',()=>game.run.quota=170],['quota',()=>game.run.daysLeft--],['quota',()=>game.run.day++],
 ]){const before=s[panel].ctx.clears;change();s.update(.2);assert.equal(s[panel].ctx.clears,before+1,`${panel}: changed display repaints`);s.update(.2);assert.equal(s[panel].ctx.clears,before+1,`${panel}: unchanged display stays cached`);sameAsDirect(s,panel);}
 const before=s.status.ctx.clears;s.update(.2);const stable=s.status.ctx.clears;game.run.time=483.8;s.update(.2);assert.equal(s.status.ctx.clears,stable,'clock uses displayed second');assert.ok(stable>=before);
});
await test('native proximity, direct redraw and external texture mutation are respected',()=>{
 const {s,game}=screens();s.update(.2);game.camera.position.set(25,0,0);const before=paints(s);game.run.credits=99;s.update(.2);assert.deepEqual(paints(s),before);game.camera.position.set(0,0,0);s.update(.2);assert.equal(s.status.ctx.clears,before.status+1);sameAsDirect(s,'status');
 const direct=s.quota.t.version;s.drawQuota();assert.equal(s.quota.t.version,direct+1,'direct callers can explicitly repaint');s.update(.2);const stable=s.quota.ctx.clears;s.update(.2);assert.equal(s.quota.ctx.clears,stable);
 s.quota.ctx.fillRect(0,0,192,96);s.quota.ctx.fillText('EXTERNAL');s.quota.t.needsUpdate=true;const external=s.quota.ctx.clears;s.update(.2);assert.equal(s.quota.ctx.clears,external+1,'external upload invalidates caller cache');assert.ok(!s.quota.ctx.text.some(x=>x[0]==='EXTERNAL'));
});
await test('locale and delayed font readiness repaint unchanged displays',async()=>{
 const {s}=screens();s.update(.2);for(const lang of['tr','ru','en']){const before=paints(s);setLang(lang);s.update(.2);assert.equal(s.status.ctx.clears,before.status+1);assert.equal(s.quota.ctx.clears,before.quota+1);sameAsDirect(s,'quota');}
 s.update(.2);let before=paints(s);releaseFonts();for(let i=0;i<8;i++)await Promise.resolve();s.update(.2);assert.equal(s.status.ctx.clears,before.status+1);assert.equal(s.quota.ctx.clears,before.quota+1);
 s.update(.2);before=paints(s);fontListeners.get('loadingdone')?.();s.update(.2);assert.equal(s.status.ctx.clears,before.status+1);assert.equal(s.quota.ctx.clears,before.quota+1);
});
await test('live lore drawExtra override, HP, crew and event never freeze',()=>{
 const {s,game}=screens();let speaking=true,faceCalls=0;const original=s.drawExtra;s.drawExtra=function(){if(speaking){faceCalls++;this.extra.ctx.fillRect(0,0,160,120);this.extra.ctx.fillText('ALGORITHM');this.extra.t.needsUpdate=true;return;}return original.call(this);};
 for(let i=0;i<4;i++)s.update(.2);assert.equal(faceCalls,4);speaking=false;game.player.hp=43;game.remotes.set('crew',{name:'Friend',hp:26,dead:false,pos:new THREE.Vector3(),yaw:0});game.run.phase='moon';game.run.dailyEvent={name:'Tape outage',mood:'bad'};s.update(.2);assert.ok(s.extra.ctx.text.some(x=>x[0].includes('43')));assert.ok(s.extra.ctx.text.some(x=>x[0].includes('Friend')&&x[0].includes('26')));assert.ok(s.extra.ctx.text.some(x=>x[0].includes('Tape outage')&&x[1]==='#ff5a5a'));assert.ok(!s.extra.ctx.text.some(x=>x[0]==='ALGORITHM'));
 game.player.dead=true;game.remotes.delete('crew');delete game.run.dailyEvent;game.run.phase='orbit';s.update(.2);assert.ok(s.extra.ctx.text.some(x=>x[0].includes('DEAD')));assert.ok(!s.extra.ctx.text.some(x=>/Friend|Tape outage/.test(x[0])));
});
const item=(type,extra={})=>({id:'fixture:'+type,type,def:itemDef(type),rarity(){return this.tier||'common';},...extra});
await test('native hotbar retains DOM and item references for unchanged output',()=>{
 const hud=new HUD(document.body),lamp=item('flashlight',{battery:150});const slots=[lamp,null,null,null];for(let i=0;i<20;i++)hud.setInventory(slots,0);counts.hotbar=hud.$.inv.htmlWrites;assert.equal(counts.hotbar,1);
 const child=new Node28('button');let calls=0;child.addEventListener('click',()=>calls++);hud.$.inv.appendChild(child);const replacement=item('flashlight',{battery:150,id:'replacement'});hud.setInventory([replacement,null,null,null],0);assert.equal(hud.invItems[0],replacement,'same-looking replacement is current data');assert.ok(hud.$.inv.children.includes(child));child.dispatchEvent({type:'click'});assert.equal(calls,1,'unchanged subtree retains external callbacks');
 replacement.battery=149;hud.setInventory(hud.invItems,0);assert.equal(hud.$.inv.htmlWrites,2);assert.match(hud.$.inv.innerHTML,/99\.333/);
});
await test('hotbar changes preserve real item rendering and localization',()=>{
 const hud=new HUD(document.body),lamp=item('flashlight',{battery:150}),gun=item('shotgun',{ammo:2}),spray=item('spraypaint',{charges:60}),shovel=item('shovel',{dur:130});let slots=[lamp,gun,spray,shovel],active=0;
 const render=()=>{hud.setInventory(slots,active);const reference=new HUD(document.body);reference.bagTag=hud.bagTag;reference.setInventory(slots,active);assert.equal(hud.$.inv.innerHTML,reference.$.inv.innerHTML);};render();
 for(const change of[()=>active=1,()=>lamp.battery=100,()=>gun.ammo=1,()=>spray.charges=4,()=>shovel.dur=20,()=>shovel.dur=0,()=>lamp.on=true,()=>slots[0]=item('proflash',{battery:300}),()=>gun.label='<Crew gun>',()=>{gun.tier='rare';gun.plus=1;},()=>shovel.affix={prefix:'Sharp',rarity:'rare'},()=>shovel.oc=['shock']]){const before=hud.$.inv.htmlWrites;change();render();assert.equal(hud.$.inv.htmlWrites,before+1);render();assert.equal(hud.$.inv.htmlWrites,before+1);}
 for(const lang of['tr','ru','en']){setLang(lang);render();const before=hud.$.inv.htmlWrites;render();assert.equal(hud.$.inv.htmlWrites,before);}
 let before=hud.$.inv.htmlWrites;hud.setBagTag({label:'Bag',used:2,cap:8});assert.equal(hud.$.inv.htmlWrites,before+1);hud.setBagTag({label:'Bag',used:2,cap:8});assert.equal(hud.$.inv.htmlWrites,before+1);hud.setBagTag({label:'Bag',used:8,cap:8,full:true});assert.equal(hud.$.inv.htmlWrites,before+2);hud.setBagTag(null);assert.equal(hud.$.inv.htmlWrites,before+3);render();
});
let modInstance28=0;
async function installed(order){
 const mm=new ModManager(),cfgs=new Map(),nativeConfigFor=mm.configFor.bind(mm);globalThis.KefalAPI=mm.api;mm.state={enabled:{},config:{},imported:[],featuresV:1};mm.configFor=id=>{const cfg=nativeConfigFor(id);cfgs.set(id,cfg);return cfg;};
 const instance=++modInstance28;globalThis.fetch=async()=>({json:async()=>({mods:order.map(id=>`${id}.js?presentation28=${instance}`)})});await mm.loadAll();assert.deepEqual(mm.errors,[]);
 const hud=new HUD(document.body),config={inventorySlots:4};mm.emit('configure',config);assert.deepEqual(config.reservedSlots,['light']);assert.equal(config.inventorySlots,5);
 const game={config,player:{slots:Array(5).fill(null),slot:0},selfId:'self',on(){},onWelcome(d){this.config={...this.config,...d.config};},pickup(it){const i=this.player.slots.indexOf(null);if(i>=0){this.player.slots[i]=it.id;this.player.slot=i;}},onItemHeld(it,holder){if(holder==='self'){const i=this.player.slots.indexOf(null);if(i>=0)this.player.slots[i]=it.id;}},refreshHeldVisuals(){},ui:{hud}};mm.attach(game);mm.emit('boot',{ui:{hud}});mm.emit('netReady',{},game);
 const slots=[item('bolt',{value:30}),item('duck',{value:20}),null,null,null];hud.setBagTag({label:'Pockets',used:2,cap:8});hud.setInventory(slots,0);return{mm,cfgs,hud,game,slots};
}
for(const order of[['reserved-slots','hotbar-plus'],['hotbar-plus','reserved-slots']]){
 await test(`actual installed wrappers stay bounded, bag offset and unchanged DOM: ${order.join(' -> ')}`,async()=>{
  const {hud,slots}=await installed(order);const first=mutations28;for(let i=0;i<20;i++)hud.setInventory(slots,0);const inv=hud.$.inv;counts[order.join('+')]={light:inv.querySelectorAll('.kmod-res-l').length,values:inv.querySelectorAll('.kmod-hb-v').length,total:inv.querySelectorAll('.kmod-hb-total').length,unchangedMutations:mutations28-first,htmlWrites:inv.htmlWrites};
  assert.equal(inv.querySelectorAll('.kmod-res-l').length,1);assert.equal(inv.querySelectorAll('.kmod-hb-v').length,2);assert.equal(inv.querySelectorAll('.kmod-hb-total').length,1);assert.equal(mutations28-first,0,'unchanged decorations cause no child/attribute/text mutation');assert.equal(inv.htmlWrites,1);const realSlots=inv.children.filter(n=>n.classList.contains('inv-slot'));assert.equal(realSlots[4].querySelector('.kmod-res-l').textContent,'LIGHT');assert.equal(realSlots[0].querySelector('.kmod-hb-v').textContent,'▮30');assert.equal(inv.querySelector('.inv-bagtag').querySelectorAll('.kmod-hb-v').length,0);
 });
 await test(`actual installed wrapper lifecycle and native config/pickup: ${order.join(' -> ')}`,async()=>{
  const {mm,cfgs,hud,game,slots}=await installed(order),inv=hud.$.inv;const refresh=()=>hud.setInventory(slots,0),realSlots=()=>inv.children.filter(n=>n.classList.contains('inv-slot'));
  slots[0].value=47;refresh();assert.equal(realSlots()[0].querySelector('.kmod-hb-v').textContent,'▮47');assert.equal(inv.querySelector('.kmod-hb-total').textContent,'carrying ▮67');assert.equal(inv.htmlWrites,1,'value-only decoration change preserves native base HTML');
  slots[4]=item('flashlight',{battery:150});refresh();assert.equal(inv.querySelectorAll('.kmod-res-l').length,0,'filled reserved slot has no empty label');slots[4]=null;refresh();assert.equal(inv.querySelectorAll('.kmod-res-l').length,1);
  game.config.reservedSlots=['walkie'];refresh();assert.equal(realSlots()[4].querySelector('.kmod-res-l').textContent,'RADIO');game.config.reservedSlots=[];refresh();assert.equal(inv.querySelectorAll('.kmod-res-l').length,0);assert.equal(inv.querySelectorAll('.kmod-res').length,0);
  cfgs.get('hotbar-plus').showValues=false;refresh();assert.equal(inv.querySelectorAll('.kmod-hb-v').length,0);cfgs.get('hotbar-plus').showTotal=false;refresh();assert.equal(inv.querySelectorAll('.kmod-hb-total').length,0);cfgs.get('hotbar-plus').showValues=true;cfgs.get('hotbar-plus').showTotal=true;refresh();assert.equal(inv.querySelectorAll('.kmod-hb-v').length,2);assert.equal(inv.querySelectorAll('.kmod-hb-total').length,1);
  game.config.features['hotbar-plus']=false;refresh();assert.equal(inv.querySelectorAll('.kmod-hb-v').length,0);assert.equal(inv.querySelectorAll('.kmod-hb-total').length,0);game.config.features['hotbar-plus']=true;refresh();assert.equal(inv.querySelectorAll('.kmod-hb-total').length,1);
  slots.push(null,null,null);game.player.slots=Array(8).fill(null);refresh();assert.equal(inv.classList.contains('kmod-hb-tiny'),true);assert.equal(inv.classList.contains('kmod-hb-compact'),true);slots.length=5;game.player.slots=Array(5).fill(null);refresh();assert.equal(inv.classList.contains('kmod-hb-tiny'),false);assert.equal(inv.classList.contains('kmod-hb-compact'),false);
  mm.detach();refresh();assert.equal(inv.querySelectorAll('.kmod-res-l').length,0);mm.attach(game);game.config.reservedSlots=['light'];refresh();mm.attach({...game,config:{reservedSlots:[],features:{'hotbar-plus':false}}});refresh();assert.equal(inv.querySelectorAll('.kmod-res-l').length,0);assert.equal(inv.querySelectorAll('.kmod-hb-total').length,0);mm.attach(game);
  game.player.slots=['held',null,null,null,null];game.player.slot=0;game.pickup({id:'lamp-native',type:'flashlight'});assert.deepEqual(game.player.slots,['held',null,null,null,'lamp-native']);assert.equal(game.player.slot,0);game.player.slots=['held',null,null,null,null];game.onItemHeld({id:'loot-native',type:'bolt'},'self');assert.deepEqual(game.player.slots,['held','loot-native',null,null,null]);game.onWelcome({config:{features:{'reserved-slots':false}}});assert.equal(Object.hasOwn(game.config,'reservedSlots'),false,'old host without reserved config removes client assumption');const host={inventorySlots:4};mm.state.enabled['reserved-slots']=false;mm.detach();mm.emit('configure',host);assert.deepEqual(host.reservedSlots,[]);assert.equal(host.inventorySlots,4);mm.clear();
 });
}
setLang('en');for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
console.log('presentation28 counters '+JSON.stringify(counts));
if(failures.length){for(const failure of failures)console.error('FAIL '+failure);process.exitCode=1;}else console.log(`presentation28: ${tests.length} actual-component regressions pass; explicit DOM/canvas fixtures, no browser/FPS claim`);
