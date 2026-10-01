// NATIVE_INTEGRATION: actual Terminal, Session host/peer delivery, installed
// Routeboard/Shipyard/Voyage and native mod dispatch. DOM records callbacks and
// focus; this is not browser/CSS readability, world travel or Internet evidence.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './ship2_env.mjs';
register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const canvas = document.createElement('canvas');
class Node30 {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.style={};this.value='';this._classes=new Set();this.handlers=new Map();this.disabled=false;this.classList={add:(...v)=>v.forEach(x=>this._classes.add(x)),remove:(...v)=>v.forEach(x=>this._classes.delete(x)),contains:x=>this._classes.has(x)}; }
  set className(v){this._classes=new Set(String(v).split(/\s+/));} get className(){return [...this._classes].join(' ');}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=v;}
  appendChild(n){n.parentNode=this;this.children.push(n);return n;} append(...v){v.forEach(n=>this.appendChild(n));}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
  addEventListener(k,fn,capture=false){const list=this.handlers.get(k)||[];list.push({fn,capture});this.handlers.set(k,list);}
  removeEventListener(k,fn){this.handlers.set(k,(this.handlers.get(k)||[]).filter(x=>x.fn!==fn));}
  dispatchEvent(e){e.target ||= this;for(const phase of [true,false])for(const h of this.handlers.get(e.type)||[])if(h.capture===phase&&!e.immediate)h.fn(e);}
  matches(s){return s.startsWith('.')?this._classes.has(s.slice(1)):s.startsWith('[')?Object.hasOwn(this.dataset,s.slice(6,-1)):this.tagName===s.toUpperCase();}
  closest(s){return this.matches(s)?this:this.parentNode?.closest(s)||null;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  querySelectorAll(s){const out=[];const walk=n=>{for(const c of n.children){if(c.matches(s))out.push(c);walk(c);}};walk(this);return out;}
  set innerHTML(value){this._html=String(value);this.children=[];const stack=[this];for(const m of this._html.matchAll(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi)){if(m[0].startsWith('</')){if(stack.length>1)stack.pop();continue;}const n=new Node30(m[1]);for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)){n.setAttribute(a[1],a[2]);if(a[1].startsWith('data-'))n.dataset[a[1].slice(5)]=a[2];}n.disabled=/\sdisabled(?:\s|$)/.test(m[2]);stack.at(-1).appendChild(n);if(!['INPUT','BR','HR','IMG','PATH'].includes(n.tagName)&&!m[2].trim().endsWith('/'))stack.push(n);}}
  get innerHTML(){return this._html||'';} set textContent(v){this._text=String(v);this.children=[];} get textContent(){return (this._text||'')+this.children.map(n=>n.textContent).join('');}
  focus(){document.activeElement=this;} blur(){if(document.activeElement===this)document.activeElement=null;}
  getContext(...a){return canvas.getContext(...a);} get scrollHeight(){return 0;}
}
const uiRoot=new Node30(),head=new Node30('head');
globalThis.document={createElement:tag=>new Node30(tag),head,body:new Node30('body'),documentElement:{},activeElement:null,getElementById:id=>id==='ui'?uiRoot:head.children.find(n=>n.id===id)||null,addEventListener(){},fonts:{load:()=>Promise.resolve()}};
globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.requestIdleCallback=()=>0;
const [{Terminal},{Session},{Emitter},{MOONS,MOON_ORDER,registerMoon},{ensureSector,sectorMoons},{installRouteboard},{installShipyard},Y,{installVoyage},{ModManager},i18n,R,Menu]=await Promise.all([
  import('../../src/game/terminal.js'),import('../../src/net/session.js'),import('../../src/core/events.js'),import('../../src/game/moons.js'),import('../../src/game/moongen.js'),import('../../src/game/routeboard.js'),import('../../src/game/shipyard.js'),import('../../src/game/shipyard_core.js'),import('../../src/game/voyage.js'),import('../../src/mods/modapi.js'),import('../../src/core/i18n.js'),import('../../src/game/moonroute30.js'),import('../../src/game/terminalmoons30.js')]);
const errors=[],warnings=[],oldError=console.error,oldWarn=console.warn;console.error=(...v)=>{errors.push(v);oldError(...v);};console.warn=(...v)=>{warnings.push(v);oldWarn(...v);};
const baselineIds=new Set(MOON_ORDER),disposers=[];
const makeMods=()=>{const m=new Emitter();m.commands=new Map();m.featureOn=()=>true;m.terminalCommand=ModManager.prototype.terminalCommand;m.api={registerCommand:(name,fn,help)=>m.commands.set(name,{fn,help})};return m;};
const hnet=new Session({strategy:'local',isHost:true,code:'MOON30',profile:{}}),pnet=new Session({strategy:'local',isHost:false,code:'MOON30',profile:{}});
hnet.selfId=hnet.hostId='host';pnet.selfId='peer';pnet.hostId='host';pnet.connected=true;hnet.players.set('peer',{id:'peer'});pnet.players.set('host',{id:'host'});
hnet.transport={peers:new Set(['peer']),send:m=>pnet.receive(m,'host')};pnet.transport={peers:new Set(['host']),send:m=>hnet.receive(m,'peer')};
const state=Y.blankState();state.m[Y.freeSockets(state,'bunk')[0]]={id:'bunk',t:1};
const run={runId:'native-moons30',seed:17,day:1,quotaIndex:0,phase:'orbit',moon:'hamsi',credits:1000,daysLeft:3,quota:330,sold:0,forecast:{palamut:'stormy'},sy:state};
const makeGame=(net,isHost,r)=>({net,isHost,selfId:net.selfId,run:r,config:{freeTravel:false},mods:makeMods(),settings:{unlockAll:true},profile:{bestiary:{},shipyard:state},player:{dead:false,frozen:false,pos:{x:0,y:0,z:0},vel:{set(){}},slots:[],inShip:true},remotes:new Map(),world:{outdoor:null,facility:null,terrain:null},items:{all:()=>[],get:()=>null,inShipItems:()=>[]},creatures:{host:new Map(),views:new Map()},env:{setSpace(){}},planetColorFor:()=>0,input:{lock(){},unlock(){}},audio:{variant:()=>''},sfx(){},ui:{decorateTerminal(){},toast(){},hud:{bigText(){}}},engine:{},time:0,later:fn=>{fn();return 0;},broadcastRun(keys){net.broadcast('gs',Object.fromEntries(keys.map(k=>[k,this.run[k]])));}});
const hg=makeGame(hnet,true,run),pg=makeGame(pnet,false,structuredClone(run));
hg.terminal=new Terminal(hg);pg.terminal=new Terminal(pg);
hnet.handle('term',(d,from)=>{requests++;hg.terminal.hostExecute(d.cmd,from);});
hnet.on_('gs',()=>{});pnet.on_('gs',d=>Object.assign(pg.run,d));hnet.on_('term',d=>hg.terminal.onRemote(d));pnet.on_('term',d=>pg.terminal.onRemote(d));
let requests=0;const flush=()=>{pnet.flush();hnet.flush();},text=term=>term.lines.map(l=>l.text).join('\n');
const command=(term,value)=>{term.inp.value=value;term.inp.dispatchEvent({type:'keydown',key:'Enter',stopPropagation(){}});flush();};
try {
  hg.shipyard=installShipyard(hg);pg.shipyard=installShipyard(pg);disposers.push(()=>pg.shipyard.dispose(),()=>hg.shipyard.dispose());
  // Installed Voyage registers its real wrappers in a labelled command registry;
  // native ModManager dispatch and Routeboard delegation execute those callbacks.
  hg.voyage=installVoyage(hg);pg.voyage=installVoyage(pg);disposers.push(()=>pg.voyage.dispose(),()=>hg.voyage.dispose());
  hg.routeboard=installRouteboard(hg);pg.routeboard=installRouteboard(pg);disposers.push(()=>pg.routeboard.dispose(),()=>hg.routeboard.dispose());
  ensureSector(run);ensureSector(pg.run);
  const list=Menu.directoryMoons30();
  for(const q of ['DIA','56k','56K Dial','56k-dialup','hamsi','ham'])assert.equal(R.resolveMoonQuery30(q,list,sectorMoons()).moon.id,'hamsi');
  for(const q of ['forum','lufer'])assert.equal(R.resolveMoonQuery30(q,list,sectorMoons()).moon.id,'lufer');
  assert.equal(R.resolveMoonQuery30('12',[MOONS.hamsi,MOONS.lufer,MOONS.palamut]).moon.id,'lufer','unique numbered prefix');
  assert.ok(R.resolveMoonQuery30('12',list,sectorMoons()).choices.some(m=>m.id==='lufer'),'live competing numeric codes remain choices');
  for(const q of ['404','NOT FOUND','not-f','ork'])assert.equal(R.resolveMoonQuery30(q,list,sectorMoons()).moon.id,'orkinos');
  assert.equal(R.resolveMoonQuery30('#1',list,sectorMoons()).moon.id,sectorMoons()[0].id);assert.equal(R.resolveMoonQuery30('1',list,sectorMoons()).moon.id,sectorMoons()[0].id);
  for(const q of ['#0','#12','#9','#bogus','#'])assert.equal(R.resolveMoonQuery30(q,list,sectorMoons()).moon,null,'invalid explicit slot '+q);
  const a=registerMoon({id:'fixture30_a',name:'71-Relay Archive',short:'Relay'}),b=registerMoon({id:'fixture30_b',name:'72-Relay Foundry',short:'Relay Foundry'}),c=registerMoon({id:'fixture30_diacritic',name:'7-IŞIK ÇÖĞÜ',short:'IŞIK ÇÖĞÜ',desc:'Recorded diacritic fixture.'});
  assert.equal(R.normalizeMoonQuery30(' Işık-ÇÖĞÜ '),'isikcogu');assert.equal(R.resolveMoonQuery30('isik cogu',[c]).moon,c);assert.equal(R.resolveMoonQuery30('7-isik',[c]).moon,c);
  assert.equal(R.resolveMoonQuery30('relay',[a,b]).moon,a,'exact short wins over longer prefix');assert.equal(R.resolveMoonQuery30('rel',[a,b]).moon,null);assert.equal(R.resolveMoonQuery30('rel',[a,b]).choices.length,2);
  assert.equal(R.resolveMoonQuery30('fixture30_b',[a,b]).moon,b,'canonical exact ID');assert.equal(R.resolveMoonQuery30('archivemissing',[a,b]).moon,null,'no matches across joined keys');
  const before=run.credits;pg.terminal.exec('route rel');assert.equal(pg.terminal.pending,null);assert.equal(requests,0);assert.match(text(pg.terminal),/71-Relay Archive/);assert.match(text(pg.terminal),/72-Relay Foundry/);assert.equal(run.credits,before);
  pg.terminal.open();assert.ok(pg.terminal.moonMenu.visible(),'native orbit open reaches detailed directory');
  const menu=pg.terminal.el.querySelector('.tm30'),search=menu.querySelector('.tm30-search');assert.equal(document.activeElement,search);
  await new Promise(resolve=>setTimeout(resolve,40));assert.equal(document.activeElement,search,'native delayed open focus cannot steal search');pg.terminal.el.dispatchEvent({type:'mousedown',target:search});await new Promise(resolve=>setTimeout(resolve,5));assert.equal(document.activeElement,search,'native bubbled mouse focus cannot steal search');
  search.value='palamut';search.dispatchEvent({type:'input',target:search});assert.equal(menu.querySelectorAll('.tm30-row').length,1);
  const row=menu.querySelector('.tm30-row');menu.dispatchEvent({type:'click',target:row});const fee=hg.shipyard.routeFee(MOONS.palamut,false);assert.equal(fee,231);assert.match(menu.querySelector('.tm30-detail').innerHTML,/231/);assert.match(menu.querySelector('.tm30-detail').innerHTML,/Stormy/);assert.match(menu.querySelector('.tm30-detail').innerHTML,/Estimated loose scrap/);
  menu.dispatchEvent({type:'click',target:menu.querySelector('.tm30-route')});assert.equal(pg.terminal.pending.moon,'palamut');assert.equal(pg.terminal.moonMenu.visible(),false);assert.equal(run.moon,'hamsi');assert.equal(run.credits,before,'route button only prepares confirmation');assert.equal(requests,0);
  command(pg.terminal,'confirm');assert.equal(run.moon,'palamut');assert.equal(pg.run.moon,'palamut');assert.equal(run.credits,before-fee);assert.equal(pg.run.credits,run.credits);assert.equal(requests,1);command(pg.terminal,'confirm');assert.equal(requests,1,'consumed confirmation cannot spend twice');
  pg.terminal.exec('route #0');assert.equal(pg.terminal.pending,null);assert.equal(requests,1);pg.terminal.exec('info rel');assert.match(text(pg.terminal),/More than one moon/);
  pg.terminal.exec('moons text');assert.match(text(pg.terminal),/Route ID|ID palamut/);assert.equal(pg.terminal.moonMenu.visible(),false,'explicit text survives installed mod wrappers');
  pg.terminal.exec('board');assert.ok(pg.routeboard.visible(),'legacy daily board remains explicit');pg.terminal.exec('moons all');assert.ok(pg.terminal.moonMenu.visible());assert.equal(pg.routeboard.visible(),false);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(document.activeElement,search,'legacy board hide timer cannot steal directory search');
  pg.terminal.exec('moons text');assert.equal(pg.terminal.moonMenu.visible(),false,'text request reveals text even from an already visible directory');pg.terminal.exec('moons');
  const callbacks=pg.mods._h.get('update')?.size||0;pg.terminal.close();assert.equal(pg.terminal.moonMenu.visible(),false);assert.equal(pg.mods._h.get('update')?.size,callbacks-1,'visible-only directory poll is removed on close');
  pg.terminal.open();pg.terminal.exec('moons');for(const lang of ['tr','ru']){i18n.setLang(lang);assert.equal(menu.querySelector('.tm30-title').textContent,i18n.t(Menu.MOON_DIRECTORY_TEXT30.title[0]));assert.notEqual(menu.querySelector('.tm30-title').textContent,'MOON DIRECTORY');}i18n.setLang('en');
  // Actual foremost window capture must win before the terminal's local key handler.
  const {installEscape27}=await import('../../src/ui/escape27.js'),{Input}=await import('../../src/core/input.js');
  const input=new Input({requestPointerLock(){}},{keys:{emoteWheel:'KeyB'},fullscreenPlay:false});input.lock=()=>{};input.unlock=()=>{};pg.input=input;
  const keyTarget=new Node30(),escapeOff=installEscape27({ui:pg.ui,game:pg,input},keyTarget);disposers.push(escapeOff);
  const escape=()=>{const e={type:'keydown',key:'Escape',code:'Escape',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.immediate=true;}};keyTarget.dispatchEvent(e);return e;};
  input.down.add('Escape');input.pressedSet.add('Escape');assert.ok(escape().defaultPrevented);assert.equal(pg.terminal.moonMenu.visible(),false);assert.equal(pg.terminal.active,true,'first native capture Escape returns directory to command prompt');assert.equal(document.activeElement,pg.terminal.inp);assert.equal(input.down.has('Escape'),false);assert.equal(input.pressedSet.has('Escape'),false);
  assert.ok(escape().defaultPrevented);assert.equal(pg.terminal.active,false,'second native capture Escape closes terminal');assert.equal(pg.player.frozen,false);pg.terminal.open();
  // Native authoritative denial boundaries preserve the one wallet and destination.
  const deny=(cmd,pattern)=>{const moon=run.moon,credits=run.credits;hg.terminal.hostExecute(cmd,'peer');flush();assert.equal(run.moon,moon);assert.equal(run.credits,credits);assert.match(text(pg.terminal),pattern);};
  run.phase='moon';deny({op:'route',moon:'lufer'},/Cannot route now/);run.phase='orbit';run.credits=1;deny({op:'route',moon:'cipura'},/Insufficient credits/);run.credits=1000;
  hg.settings.unlockAll=false;hg.onboard={unlocks:()=>({mode:'staged',q:0})};deny({op:'route',moon:'lufer'},/quota 1/);hg.settings.unlockAll=true;run.daysLeft=0;deny({op:'route',moon:'lufer'},/Deadline reached/);run.daysLeft=3;
  const {registerLab24Moons,LAB24_MOON_DEFS}=await import('../../src/game/lab24_moons.js');registerLab24Moons();for(const m of LAB24_MOON_DEFS){assert.equal(Menu.directoryMoons30().some(x=>x.id===m.id),false);deny({op:'route',moon:m.id},/Cannot route now/);}
  pg.run.quotaIndex=run.quotaIndex;pg.terminal.exec('route #1');const pending=structuredClone(pg.terminal.pending);assert.equal(pending.moon,sectorMoons()[0].id);assert.ok(pending.sectorKey);
  run.quotaIndex++;ensureSector(run);deny(pending,/sector changed/i);pg.run.quotaIndex=run.quotaIndex;pg.run.moon=run.moon;
  pg.terminal.exec('route #1');assert.equal(pg.terminal.pending,null,'old displayed sector numbers must not silently select a different server');assert.match(text(pg.terminal),/sector changed/i);
  pg.terminal.exec('moons');pg.terminal.exec('route #1');assert.equal(pg.terminal.pending.moon,sectorMoons()[0].id);assert.notEqual(pg.terminal.pending.moon,pending.moon);
  hg.config.freeTravel=true;pg.config.freeTravel=true;const currentData=Menu.moonDirectoryData30(pg);assert.equal(currentData.rows.find(x=>x.id==='palamut').fee,hg.shipyard.routeFee(MOONS.palamut,true),'free-travel module surcharge is actual native fee');assert.equal(currentData.rows.find(x=>x.id==='hamsi').fee,hg.shipyard.routeFee(MOONS.hamsi,true));
  for(const x of currentData.rows)assert.equal(R.resolveMoonQuery30(x.alias,Menu.directoryMoons30(),sectorMoons(),Menu.moonNames30).moon?.id,x.id,'displayed alias resolves uniquely '+x.alias);
  const nativeDocument=globalThis.document;delete globalThis.document;try{hg.terminal.exec('moons');assert.match(text(hg.terminal),/CURRENT ROUTE/);assert.equal(hg.terminal.active,false,'true DOM-free command prints native text without opening an overlay');}finally{globalThis.document=nativeDocument;}
  assert.equal(errors.length,0);assert.equal(warnings.length,0);
} finally {
  pg.terminal.close();hg.terminal.close();pg.terminal.moonMenu.dispose();hg.terminal.moonMenu.dispose();for(const off of disposers.reverse())off();
  for(const id of [...MOON_ORDER])if(!baselineIds.has(id)){delete MOONS[id];MOON_ORDER.splice(MOON_ORDER.indexOf(id),1);}i18n.setLang('en');console.error=oldError;console.warn=oldWarn;
}
console.log('moonroute30 native normalized/ambiguous/slot routing, directory focus/input/Escape, installed wrappers, host/peer fee and rejection PASS');
