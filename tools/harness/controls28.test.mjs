import fs from 'node:fs/promises';
// Native listener regression: actual App.bindKeys source method executes without
// booting WebGL/fonts. Real Input, UI lifecycle/navigation and HUDcalm execute.
// The fixture supplies DOM nodes and event capture ordering, not action logic.
import assert from 'node:assert/strict';
class Events {
  listeners=[];
  addEventListener(type,fn,opt=false) { this.listeners.push({type,fn,capture:opt===true||!!opt?.capture}); }
  removeEventListener(type,fn,opt=false) { const capture=opt===true||!!opt?.capture; this.listeners=this.listeners.filter(v=>v.type!==type||v.fn!==fn||v.capture!==capture); }
  dispatchEvent(e) { let stop=false; const native=e.stopImmediatePropagation.bind(e); e.stopImmediatePropagation=()=>{stop=true;native();}; for(const phase of [true,false]) for(const v of [...this.listeners]) if(!stop&&v.type===e.type&&v.capture===phase)v.fn(e); return !e.defaultPrevented; }
}
class Node extends Events {
  classes=new Set(); children=[]; dataset={}; style={setProperty(){},getPropertyValue(){return '';}}; isConnected=true; innerHTML='';textContent='';
  set className(v){this.classes=new Set(String(v).split(/\s+/).filter(Boolean));} get className(){return [...this.classes].join(' ');}
  classList={contains:v=>this.classes.has(v),add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),toggle:(v,on)=>{on=on??!this.classes.has(v);on?this.classes.add(v):this.classes.delete(v);return on;}};
  append(...v){this.children.push(...v);} appendChild(v){this.append(v);return v;} contains(v){return this===v||this.children.some(n=>n===v||n.contains?.(v));} querySelector(){return null;} querySelectorAll(){return [];} remove(){this.isConnected=false;} blur(){document.activeElement=null;}
}
const win=globalThis.window=new Events(),doc=globalThis.document=new Events();
doc.head=new Node();doc.body=new Node();doc.documentElement=new Node();doc.activeElement=null;doc.pointerLockElement=null;doc.getElementById=()=>doc.body;doc.createElement=()=>new Node();doc.querySelectorAll=()=>[];
const {Input}=await import(new URL('../../src/core/input.js', import.meta.url));
const {UI}=await import(new URL('../../src/ui/ui.js', import.meta.url));
const {DEFAULT_KEYS}=await import(new URL('../../src/core/a11y_core.js', import.meta.url));
const {defaultProfile}=await import(new URL('../../src/core/save.js', import.meta.url));
const {Emitter}=await import(new URL('../../src/core/events.js', import.meta.url));
const {installHudCalm}=await import(new URL('../../src/game/hudcalm.js', import.meta.url));
const {hasEscapeLayer27,installEscape27}=await import(new URL('../../src/ui/escape27.js', import.meta.url));
const settings={keys:{...DEFAULT_KEYS},hudDensity:'standard',fullscreenPlay:false};
const canvas=new Node();canvas.requestPointerLock=()=>Promise.resolve();
const input=new Input(canvas,settings);input.locked=true;
let locks=0;input.lock=()=>{locks++;input.locked=true;};input.unlock=()=>{input.locked=false;};
let opened=0,closed=0;
const ui={panelOpen:null,chatOpen:false,marketOpen:false,dialogEl:null,overlay:new Node(),clickHint:new Node(),hud:{el:new Node()},blocksInput:UI.prototype.blocksInput,fullscreenOpen:()=>false,openTab(){opened++;this.panelOpen=new Node();},openPause(){opened++;this.panelOpen=new Node();this.panelOpen.classList.add('pause');},closePanel(){closed++;return UI.prototype.closePanel.call(this);},openPanel:UI.prototype.openPanel,onNavKey:UI.prototype.onNavKey,navScope(){return this.panelOpen;},openChat(){this.chatOpen=true;}};
const game={run:{phase:'orbit',day:1,moon:'__relay13',credits:120,daysLeft:3,quota:150},profile:defaultProfile(),settings,input,ui,mods:new Emitter(),terminal:{active:false},player:{hp:100,maxHp:100},objectives:{full:[{kind:'main',text:'Claim a free ship'}]},remotes:new Map(),selfId:'host',playerName:()=> 'Janitor'};
const app={settings,input,ui,game,engine:{canvas}};ui.app=app;
const src=await fs.readFile(new URL('../../src/main.js',import.meta.url),'utf8');
const body=src.match(/\n  bindKeys\(\) \{([\s\S]*?)\n  \}\n\n  applySettings/)[1];
const bindKeys=new Function('hasEscapeLayer27','installEscape27','setInterval',`return function(){${body}}`)(hasEscapeLayer27,installEscape27,()=>0);
win.addEventListener('keydown',e=>ui.onNavKey(e));
bindKeys.call(app);
game.hudcalm=installHudCalm(game);
const card=doc.body.children.find(n=>n.className==='hc-tab');assert.ok(card);
function key(type,code,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,{code,key:code==='Tab'?'Tab':code.replace(/^Key/,''),...props});win.dispatchEvent(e);return e;}
// Browser focus/fullscreen loss must only offer recapture, never create a menu.
input.locked=false;input.onLockChange(false,false);
assert.equal(ui.panelOpen,null,'involuntary pointer unlock does not open pause');
assert.equal(opened,0);assert.equal(ui.clickHint.classList.contains('hidden'),false);
const beforeShortcutLocks=locks;
key('keydown','KeyW',{ctrlKey:true});assert.equal(locks,beforeShortcutLocks,'browser shortcut cannot recapture pointer');
key('keydown','KeyT',{ctrlKey:true});assert.equal(ui.chatOpen,false,'browser shortcut cannot open chat');
key('keyup','KeyW');key('keyup','KeyT');
// Browser unlock precedes Escape: the explicit key owns pause, once.
key('keydown','Escape');assert.equal(opened,1);assert.ok(ui.panelOpen);
key('keydown','Escape',{repeat:true});assert.ok(ui.panelOpen);assert.equal(opened,1);
key('keyup','Escape');key('keydown','Escape');assert.equal(ui.panelOpen,null);
key('keyup','Escape');opened=0;
// An existing panel closes even when unlock/relock notifications interleave.
ui.openPanel(new Node());input.onLockChange(false,false);
key('keydown','Escape');assert.equal(ui.panelOpen,null);assert.equal(opened,0);
input.locked=false;input.onLockChange(false,false);assert.equal(ui.panelOpen,null);
key('keyup','Escape');input.locked=true;input.onLockChange(true,false);
for(const modifier of ['ctrlKey','metaKey']){
 const shortcut=key('keydown','Tab',{[modifier]:true});
 assert.equal(shortcut.defaultPrevented,false,'native status shortcut keeps browser action');
 assert.equal(card.classList.contains('on'),false,'native status shortcut does not show status');
 key('keyup','Tab');
}
// Input prevents browser Tab focus in locked play; HUDcalm must still see it.
let e=key('keydown','Tab');
assert.equal(e.defaultPrevented,true);assert.equal(card.classList.contains('on'),true);
assert.equal(opened,0,'status does not open Character');assert.equal(input.locked,true);
assert.match(card.innerHTML,/Claim a free ship/,'native compact card renders the goal');
key('keyup','Tab');assert.equal(card.classList.contains('on'),false);
assert.equal(doc.documentElement.classList.contains('hc-tab-on'),false);
for(const code of ['KeyU','KeyF']){
 settings.keys.menu=code;e=key('keydown',code);
 assert.equal(card.classList.contains('on'),true,code+' reaches existing status');
 assert.equal(opened,0,'remapping must not open Character');
 key('keydown',code,{repeat:true});assert.equal(card.classList.contains('on'),true);
 key('keyup',code);assert.equal(card.classList.contains('on'),false);
}
settings.keys.menu='KeyU';
key('keydown','KeyU',{isComposing:true});assert.equal(card.classList.contains('on'),false);
key('keyup','KeyU');
doc.activeElement={tagName:'INPUT',type:'text'};
e=key('keydown','KeyU');assert.equal(e.defaultPrevented,false);assert.equal(card.classList.contains('on'),false);
key('keyup','KeyU');doc.activeElement=null;
const box=new Node();ui.openPanel(box);assert.equal(input.locked,false);
let handoffs=0;ui.onPanelClose=()=>{handoffs++;return false;};
e=key('keydown','KeyU');assert.equal(e.defaultPrevented,true);assert.equal(ui.panelOpen,null);
assert.equal(handoffs,1,'actual close callback fires once');assert.equal(card.classList.contains('on'),false,'closing a panel cannot show status from same gesture');
key('keyup','KeyU');key('keydown','KeyU');assert.equal(card.classList.contains('on'),true);
win.dispatchEvent(new Event('blur'));assert.equal(card.classList.contains('on'),false);assert.equal(input.down.size,0);
key('keyup','KeyU');
// Native form Tab remains available; status stays suppressed behind the panel.
settings.keys.menu='Tab';ui.openPanel(new Node());
e=key('keydown','Tab');assert.equal(e.defaultPrevented,false,'browser can advance form focus');assert.ok(ui.panelOpen);assert.equal(card.classList.contains('on'),false);
key('keyup','Tab');
doc.activeElement={tagName:'INPUT',type:'text'};
e=key('keydown','Tab');assert.equal(e.defaultPrevented,false);assert.ok(ui.panelOpen);
key('keyup','Tab');doc.activeElement=null;ui.closePanel();
for(const owner of ['terminal','minigame','market']){
 if(owner==='terminal')game.terminal.active=true;
 if(owner==='minigame')game.minigame={};
 if(owner==='market')ui.marketOpen=true;
 key('keydown','Tab');assert.equal(card.classList.contains('on'),false,owner+' owns input');key('keyup','Tab');
 game.terminal.active=false;game.minigame=null;ui.marketOpen=false;
}
ui.hud.el.classList.add('hidden');key('keydown','Tab');assert.equal(card.classList.contains('on'),false);key('keyup','Tab');ui.hud.el.classList.remove('hidden');
key('keydown','Tab');assert.equal(card.classList.contains('on'),true);
ui.openPanel(new Node());game.mods.emit('update',.02,game);assert.equal(card.classList.contains('on'),false,'opening a real panel cancels held status');
ui.closePanel();key('keyup','Tab');key('keydown','Tab');assert.equal(card.classList.contains('on'),true);
game.hudcalm.dispose();assert.equal(card.isConnected,false);assert.equal(doc.documentElement.classList.contains('hc-tab-on'),false,'teardown clears root status presentation');
key('keyup','Tab');key('keydown','Tab');assert.equal(doc.documentElement.classList.contains('hc-tab-on'),false,'disposed listener cannot return');
assert.equal(opened,0);assert.ok(locks>0);
console.log('controls28: actual Input/App/UI/HUDcalm unlock without menus, explicit Esc close/pause, native shortcuts, locked Tab + remap, native panel close, form Tab, typing/composition, release/blur and teardown pass');

// Actual Fleet/WorldMarker lifecycle. Coordinates/range are supplied here;
// physical native E/LOS access is a separate encounters-agent regression.
const { installFleet13 } = await import(new URL('../../src/game/fleet13.js', import.meta.url));
const { sanitizeFleet13 } = await import(new URL('../../src/game/fleet13_core.js', import.meta.url));
const { HUB13_BROKER, HUB13_BOARD } = await import(new URL('../../src/world/hub13.js', import.meta.url));
const { PerspectiveCamera, Vector3 } = await import('three');
globalThis.innerWidth=800;globalThis.innerHeight=600;
const fleetMods=new Emitter(),handlers=new Map();
const fleetGame={isHost:true,selfId:'host',profile:{shipyard:{}},
 run:{phase:'orbit',credits:60,moon:'hamsi',day:1,fleet13:sanitizeFleet13()},
 player:{pos:new Vector3(...HUB13_BROKER),dead:false,downed:false,inShip:false},
 remotes:new Map(),world:{moonId:'__relay13',seed:13},mods:fleetMods,
 camera:new PerspectiveCamera(),ship:{spawns:[new Vector3()],door:{setOpen(){}}},
 ui:{blocksInput:()=>!!fleetGame.ui.panelOpen,toast(){}},
 net:{request(k,d){handlers.get(k)?.(d,'host');},sendTo(){}},
 loadMapFor(){this.world.moonId='hamsi';},broadcastRun(){},hostSave(){},
};
fleetGame.camera.updateMatrixWorld();
const fleet=installFleet13(fleetGame);
fleetMods.emit('registerHandlers',(k,fn)=>handlers.set(k,fn),fleetGame);
const cueNodes=()=>doc.body.children.filter(n=>n.isConnected&&n.style.cssText?.includes('white-space:nowrap'));
const frame=dt=>fleetMods.emit('update',dt,fleetGame);
frame(1);let cue=cueNodes()[0];assert.equal(cueNodes().length,1);assert.equal(cue.innerHTML,'FLEET OFFICE');
fleetGame.ui.panelOpen=new Node();frame(45);assert.equal(cue.isConnected,true,'reading does not expire the dock task');
fleetGame.ui.panelOpen=null;frame(30);assert.equal(cueNodes()[0],cue,'walking after reading retains the same single cue');
fleet.request('buy','courier');assert.equal(fleetGame.run.fleet13.selected,'courier','native host purchase changes the dock task');
frame(.1);assert.equal(cue.isConnected,false);cue=cueNodes()[0];assert.equal(cueNodes().length,1);assert.equal(cue.innerHTML,'DEPARTURE');
frame(60);assert.equal(cueNodes()[0],cue,'selected-vessel cue survives until departure');
fleetGame.player.pos.set(...HUB13_BOARD);fleet.request('board');assert.equal(fleet.docked(),false);frame(.1);
assert.equal(cue.isConnected,false);assert.equal(cueNodes().length,0,'dispatch removes dock cue');
// Surface entry is still a bounded, per-landing hint for host and crew alike.
fleetGame.run.phase='moon';fleetGame.world.seed=91;fleetGame.player.pos.set(2.6,-1.2,8);
frame(1);assert.equal(cueNodes().length,1);cue=cueNodes()[0];assert.equal(cue.innerHTML,'SHIP ENTRY');
frame(13);assert.equal(cue.isConnected,false);frame(30);assert.equal(cueNodes().length,0,'expired surface entry never recreates');
// Re-entering dock changes the task lifecycle, while guests receive no host cue.
fleetGame.run.phase='orbit';fleetGame.run.fleet13.docked=true;fleetGame.world.moonId='__relay13';frame(.1);
assert.equal(cueNodes().length,1);cue=cueNodes()[0];fleetGame.isHost=false;frame(.1);assert.equal(cue.isConnected,false);assert.equal(cueNodes().length,0);
fleetGame.isHost=true;frame(.1);assert.equal(cueNodes().length,1);cue=cueNodes()[0];fleet.dispose();
assert.equal(cue.isConnected,false);frame(60);assert.equal(cueNodes().length,0,'disposed Fleet listener cannot leak a cue');
console.log('controls28 fleet: native persistent single dock task, host purchase/departure handoff, finite surface entry, guest exclusion and disposal pass');

// Title/first-frame event boundary: import real MenuRoom/CRTMenu with CSS only
// stripped by the native loader. Prototype fixtures omit world/canvas construction;
// actual bindEvents, keyDown, boot lifecycle, CRT input/activation and UI routes run.
const {register}=await import('node:module');
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {CRTMenu}=await import(new URL('../../src/ui/crtmenu.js',import.meta.url));
async function titleFixture(id,options={}){
 const url=new URL('../../src/ui/menuroom.js',import.meta.url);url.searchParams.set('controls28',id);
 const {MenuRoom}=await import(url); // each named case has independent native one-shot state
 const roomWin=globalThis.window=new Events(),roomDoc=globalThis.document=new Events();
 roomDoc.activeElement=null;roomDoc.pointerLockElement=null;roomDoc.body=new Node();
 globalThis.location={search:options.search||''};
 const roomApp={booted:true,settings:{keys:{},reduceMotion:!!options.reduceMotion},profile:defaultProfile(),input:{locked:false},audio:{ui(){}},stopLobbyBrowser(){}};
 const menu=Object.create(CRTMenu.prototype);
 Object.assign(menu,{mode:'title',sel:0,items:[{id:'play'}],app:roomApp,engine:{canvas:new Node(),camera:new PerspectiveCamera()}});roomApp.menu=menu;
 const roomUI=Object.create(UI.prototype);
 Object.assign(roomUI,{app:roomApp,panelOpen:null,dialogEl:null,currentScreen:'title',menuEl:new Node(),root:new Node(),hud:{show(){}},screen_browser(){this.visits=(this.visits||0)+1;}});roomApp.ui=roomUI;
 const room=Object.create(MenuRoom.prototype);
 Object.assign(room,{app:roomApp,menu,engine:menu.engine,cam:menu.engine.camera,origFov:menu.engine.camera.fov,origOrder:menu.engine.camera.rotation.order,disposed:false,state:'seated',idle:0,terminal:{active:false,dispose(){}},mouse:{},ui:{boot:new Node(),modal:new Node(),root:new Node()}});menu.room=room;
 const lines=new Node();room.ui.boot.querySelector=()=>lines;
 roomWin.addEventListener('keydown',e=>roomUI.onNavKey(e));room.bindEvents();menu.bindInput();
 return{MenuRoom,room,menu,ui:roomUI,key(code,props={}){const e=new Event('keydown',{cancelable:true});Object.assign(e,{code,key:code,...props});roomWin.dispatchEvent(e);return e;},up(code){const e=new Event('keyup',{cancelable:true});Object.assign(e,{code,key:code});roomWin.dispatchEvent(e);},dispose(){room.dispose();roomWin.removeEventListener('keydown',menu.onKey);}};
}
const race=await titleFixture('race');
race.key('Enter');assert.equal(race.ui.currentScreen,'browser','real CRT Enter reaches real UI.showMenu');assert.equal(race.menu.mode,'sub');
race.room.updateBoot(.01);assert.equal(race.room.bootChecked,true);assert.equal(!!race.room.boot?.active,false,'first-frame intro cannot cover a submenu');
race.menu.setMode('title');race.room.updateBoot(.01);assert.equal(!!race.room.boot?.active,false,'returning title cannot defer the consumed intro decision');race.dispose();
const skip=await titleFixture('skip');
skip.room.updateBoot(.01);assert.equal(skip.room.boot.active,true,'normal title retains optional intro');
assert.equal(skip.room.ui.boot.classList.contains('hidden'),false);
const skipped=skip.key('Enter');assert.equal(skipped.defaultPrevented,true);assert.equal(skip.room.boot.active,false);
assert.equal(skip.ui.currentScreen,'title','capture skip cannot also activate underlying CRT');assert.equal(skip.ui.visits,undefined);
assert.equal(skip.room.ui.boot.classList.contains('hidden'),true);
for(let i=0;i<3;i++)skip.key('Enter',{repeat:true});assert.equal(skip.ui.currentScreen,'title','held skip Enter repeats cannot activate the underlying CRT');
skip.up('Enter');
skip.menu.setItems();skip.key('ArrowDown',{repeat:true});assert.equal(skip.menu.sel,1,'arrow navigation retains OS repeats');skip.key('ArrowUp',{repeat:true});assert.equal(skip.menu.sel,0);
skip.key('Enter');assert.equal(skip.ui.currentScreen,'browser','release then a distinct press still activates normal UI');skip.up('Enter');skip.dispose();
const space=await titleFixture('space');space.room.updateBoot(.01);space.key('Space');
for(let i=0;i<3;i++)space.key('Space',{repeat:true});assert.equal(space.ui.currentScreen,'title','held skip Space repeats cannot activate the underlying CRT');
space.up('Space');space.key('Space');assert.equal(space.ui.currentScreen,'browser','released Space remains a normal activation');space.up('Space');space.dispose();
const again=await titleFixture('skip');again.room.updateBoot(.01);assert.equal(!!again.room.boot?.active,false,'native module one-shot survives another room');again.dispose();
for(const options of [{reduceMotion:true},{search:'?autohost=local'},{search:'?autojoin=ROOM'}]){
 const f=await titleFixture(JSON.stringify(options),options);f.room.updateBoot(.01);assert.equal(f.room.bootChecked,true);assert.equal(!!f.room.boot?.active,false,'existing reduced-motion/auto-session bypass retained');f.dispose();
}
const elapsed=await titleFixture('elapsed');elapsed.room.updateBoot(.01);assert.equal(elapsed.room.boot.active,true);
elapsed.room.updateBoot(10);assert.equal(elapsed.room.boot.active,false,'native automatic completion still dismisses intro');
elapsed.dispose();elapsed.room.frame(.01,elapsed.room.cam);assert.equal(elapsed.room.ui.root.isConnected,false,'disposed frame leaves menu UI removed');
console.log('controls28 title: native pre-RAF UI navigation, title-only one-shot intro, capture skip isolation, distinct next activation, motion/auto-session bypass and teardown pass');
