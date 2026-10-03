import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c);}"));
class Node {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.value='';this.children=[];this.attributes={};this.dataset={};this.style={};this.listeners={};this.className='';this.disabled=false;this.hidden=false;this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>this.className+=' '+c,remove:c=>this.className=this.className.split(' ').filter(x=>x!==c).join(' '),toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)};}
 appendChild(n){this.children.push(n);n.parentNode=this;return n;} append(...ns){ns.forEach(n=>this.appendChild(n));} remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='value')this.value=String(v);if(k==='checked')this.checked=true;if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5)]=String(v);if(k==='disabled')this.disabled=true;}
 addEventListener(k,f){this.listeners[k]=f;} focus(){document.activeElement=this;} click(){if(!this.disabled)this.listeners.click?.({preventDefault(){}});}
 get textContent(){return this.text||this.children.map(n=>n.textContent).join('');} set textContent(v){this.text=String(v);this.children=[];}
 set innerHTML(v){this.html=String(v);this.children=[];} get innerHTML(){return this.html||'';}
 querySelectorAll(s){const match=n=>s.startsWith('.')?n.className.split(' ').includes(s.slice(1)):s.startsWith('[data-')?n.attributes[s.slice(1,-1)]!==undefined:n.tagName===s.toUpperCase();const out=[];for(const n of this.children){if(match(n))out.push(n);out.push(...n.querySelectorAll(s));}return out;} querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
globalThis.document={createElement:t=>new Node(t),createTextNode:t=>{const n=new Node('#text');n.textContent=t;return n;},head:new Node('head'),body:new Node('body'),documentElement:new Node('html')};
globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.window=globalThis;
const {CRTMenu}=await import('../../src/ui/crtmenu.js');
const title=Object.create(CRTMenu.prototype),menuCalls=[];title.app={profile:null,audio:{ui(){}},ui:{showMenu:(...a)=>menuCalls.push(a)}};title.sel=0;title.refreshDailyBadge=()=>{};
title.setItems();assert.ok(title.items.some(x=>x.id==='endless'),'Endless is exposed as a distinct title entry');
title.activate(title.items.findIndex(x=>x.id==='endless'));assert.deepEqual(menuCalls,[['host',{mode:'endless'}]],'CRT routes to explicit Endless host form');
const {drawArtMenu}=await import('../../src/ui/artdir_menu.js');
title.mode='title';title.app.settings={reduceMotion:true};title._ad={ptr:null,look:{x:0,y:0},wipeAt:-9,lastKey:'title|',plateW:0,lastT:0,blinkAt:3,glitchAt:20,glitchUntil:0,memo:0};
const ctx=new Proxy({measureText:s=>({width:String(s).length*10}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true;}});
drawArtMenu(title,{ctx,canvas:{width:640,height:480}},1);const endlessRect=title.itemRects[title.items.findIndex(x=>x.id==='endless')];assert.ok(endlessRect.x1<.51,'actual art menu Endless is in GAME column');assert.ok(title.itemRects.every(r=>r.y1<.79),'actual menu entries stay above hint/ticker');
const {UI}=await import('../../src/ui/ui.js');
const hostForm=Object.create(UI.prototype),hostCalls=[];hostForm.menuOpts={mode:'endless'};hostForm.app={settings:{netStrategy:'local'},profile:{name:'Crew'},hostGame:o=>hostCalls.push(o)};hostForm.netSelect=()=>Object.assign(new Node('select'),{value:'local'});hostForm.button=(label,fn)=>{const n=new Node('button');n.textContent=label;n.addEventListener('click',fn);return n;};hostForm.backButton=()=>new Node('button');hostForm.frame=(_, ...children)=>{const n=new Node();n.append(...children);hostForm.rendered=n;return n;};hostForm.focusFirst=()=>{};
UI.prototype.screen_host.call(hostForm);const mode=hostForm.rendered.querySelectorAll('[data-nav]').find(n=>n.dataset.nav==='host:mode');assert.equal(mode.value,'endless','host form preserves title preselection');
const slotColumn=hostForm.rendered.querySelectorAll('.col')[0];assert.ok(slotColumn.classList.contains('hidden'),'Endless does not expose campaign save slots');
hostForm.rendered.querySelectorAll('button').find(n=>n.textContent.includes('START')).click();assert.equal(hostCalls[0].mode,'endless');assert.equal(hostCalls[0].runData,null);assert.equal(hostCalls[0].slot,0);assert.equal(hostCalls[0].quick,false);
const {createEndless41UI}=await import('../../src/ui/endless41.js');
let current={token:'run-a',revision:1,nonce:'draft-a',level:2,choices:[{id:'damage',name:'Damage',description:'Hit harder.',branch:'combat',rarity:'rare',before:'+0%',after:'+15%'},{id:'speed',name:'Speed',description:'Move faster.',branch:'crew',rarity:'common',before:'100%',after:'108%'},{id:'carry',name:'Carry',description:'Carry more.',branch:'salvage',rarity:'uncommon',before:'4',after:'5'}]};
let status={stage:'prep',wave:0,grace:45,level:2,xp:3,nextXp:20,shipHp:100,shipMaxHp:100,credits:60};
const calls=[],root=new Node(),hud=new Node();let enabled=true;
const game={selfId:'crew',player:{},ui:{root,hud:{el:hud},openPanel(p){this.panelOpen=p;root.append(p);},closePanel(){this.panelOpen?.remove();this.panelOpen=null;}},inventory:{entries:()=>[{id:'native-1',def:{name:'Shovel',kind:'weapon'},it:{type:'shovel'}}]},endless41:{active:()=>enabled,status:()=>status,build:()=>({level:2,perks:{damage:1},rerolls:1,bans:1}),offer:()=>current,catalog:()=>[{id:'robot',name:'Haul robot',description:'Carries cargo.',price:30,level:0,max:1,kind:'robot'},{id:'armor',name:'Armor',description:'Protect crew.',price:300,level:0,max:3,kind:'crew'}],choose:id=>calls.push(['choose',id]),reroll:()=>calls.push(['reroll']),skip:()=>calls.push(['skip']),ban:id=>calls.push(['ban',id]),buy:id=>calls.push(['buy',id])}};
const before=JSON.stringify(current),ui=createEndless41UI(game);
// Click the real HUD launcher through native UI panel/input lifecycle, rather than calling openDraft directly.
const fixtureOpen=game.ui.openPanel,fixtureClose=game.ui.closePanel,locks=[];game.ui.overlay=new Node();game.ui.overlay.classList.add('hidden');game.ui.app={game,input:{unlock(){locks.push('unlock');},lock(){locks.push('lock');}}};document.getElementById=()=>null;
game.ui.openPanel=UI.prototype.openPanel;game.ui.closePanel=UI.prototype.closePanel;game.ui.fullscreenOpen=UI.prototype.fullscreenOpen;
ui.update();const launch=hud.querySelectorAll('.e41-launch')[1];assert.equal(launch.hidden,false);launch.click();let panel=game.ui.panelOpen;assert(panel?.classList.contains('e41-panel'),'actual HUD upgrade click opens native panel');assert.deepEqual(locks,['unlock']);assert.equal(game.ui.overlay.classList.contains('hidden'),false);game.ui.closePanel(true);
game.ui.cineActive=true;launch.click();assert.equal(game.ui.panelOpen,null,'native cinematic blocks HUD upgrade panel');game.ui.cineActive=false;
game.ui.openPanel=fixtureOpen;game.ui.closePanel=fixtureClose;assert.equal(ui.openDraft(),true);panel=game.ui.panelOpen;
assert.equal(panel.querySelectorAll('.e41-card').length,3);
assert.ok(panel.textContent.includes('+0%')&&panel.textContent.includes('+15%'));
// Display the actual branch contract with licensed art, without changing offer identity.
current={...current,choices:current.choices.map((c,i)=>({...c,branch:['Striker','Engineer','Salvager'][i]})),nonce:'draft-art'};ui.update();panel=game.ui.panelOpen;
assert(document.body.classList.contains('e41-mode'),'actual active UI enables campaign-dock scope');
const {ENDLESS41_CSS}=await import('../../src/ui/endless41_style.js');assert.match(ENDLESS41_CSS,/\.e41-mode \.hud-level/);assert.match(ENDLESS41_CSS,/\.e41-mode \.hud-clock/);
const {readFile}=await import('node:fs/promises');const nativeCss=await readFile(new URL('../../src/ui/style.css',import.meta.url),'utf8');assert.match(nativeCss,/#ui \.hud, #ui \.hud \* \{ pointer-events: none;/,'native HUD intentionally rejects pointer events');assert.match(ENDLESS41_CSS,/#ui \.hud \.e41-launch\s*\{pointer-events:auto/,'actual HUD launch exception must outrank native ID selector');
assert.match(nativeCss,/#ui > \* \{ pointer-events: auto;/,'native root children otherwise intercept pointers');
const cosmeticOwners=[['game/events11_fx.js',['ev11-ov']],['ui/panels/spellbook.js',['mg-vig']],['game/crdirector.js',['cd-edge']]];
for(const [path,selectors]of cosmeticOwners){const cosmetic=await readFile(new URL(`../../src/${path}`,import.meta.url),'utf8');for(const cls of selectors){assert.match(cosmetic,new RegExp(`\\.${cls}\\s*\\{[^}]*pointer-events\\s*:\\s*none`),`${cls} owner intends cosmetic pass-through`);assert(ENDLESS41_CSS.includes(`.e41-mode #ui > .${cls}`),`${cls} mode restores cosmetic pass-through above native ID rule`);}}
assert.deepEqual(panel.querySelectorAll('img').map(n=>n.attributes.src),['/assets/ui/endless41/weapon.png','/assets/ui/endless41/armor.png','/assets/ui/endless41/health.png'],'each native branch exposes its readable art');
const stale=panel.querySelectorAll('[data-choice]')[0];current={...current,nonce:'draft-b',revision:2};stale.click();assert.equal(calls.length,0,'stale offer cannot submit');
ui.update();panel=game.ui.panelOpen;panel.querySelectorAll('[data-choice]')[1].click();assert.deepEqual(calls,[['choose','speed']]);panel.querySelectorAll('[data-choice]')[1].click();assert.equal(calls.length,1,'pending submission blocks repeat');
// Host requests self-deliver synchronously: a next offer can replace this panel during click.
current={...current,nonce:'draft-c',revision:3};ui.update();const chooseBefore=game.endless41.choose;
game.endless41.choose=id=>{calls.push(['choose',id]);current={...current,nonce:'draft-d',revision:4};ui.update();return true;};
game.ui.panelOpen.querySelectorAll('[data-choice]')[0].click();assert.equal(game.ui.panelOpen.querySelectorAll('[data-choice]')[0].disabled,false,'synchronous next offer remains usable');
game.endless41.choose=chooseBefore;
const {newEndless41,admitPlayer41,gainXp41,PERKS41}=await import('../../src/game/endless41_core.js');
const maxed=newEndless41('maxed',123),player=admitPlayer41(maxed,'crew','profile');for(const [id,perk]of Object.entries(PERKS41))if(!['damage','cadence'].includes(id))player.perks[id]=perk.max;
gainXp41(maxed,'crew',40);current=player.offer;assert.equal(current.choices.length,2,'real maxed native pool produces remaining options');
ui.update();assert.equal(game.ui.panelOpen.querySelectorAll('.e41-card').length,2,'remaining native options stay selectable without fake upgrades');
game.endless41.choose=()=>false;current={...current,nonce:'draft-reject',revision:5};ui.update();game.ui.panelOpen.querySelectorAll('[data-choice]')[0].click();assert.equal(game.ui.panelOpen.querySelectorAll('[data-choice]')[0].disabled,false,'rejected request unlocks original controls');game.endless41.choose=chooseBefore;
for(const [selector,method]of [['[data-reroll]','reroll'],['[data-skip]','skip'],['[data-ban]','ban']]){current={...current,nonce:'draft-'+method,revision:current.revision+1};ui.update();game.ui.panelOpen.querySelectorAll(selector)[0].click();assert.equal(calls.at(-1)[0],method,'real '+method+' button calls mode API');}
current=null;ui.update();assert.equal(game.ui.panelOpen,null,'authoritative completion closes draft');
const originalCatalog=game.endless41.catalog;game.endless41.catalog=()=>[...originalCatalog(),{id:'unowned-upgrade',name:'Upgrade',description:'Requires owned robot.',price:1,level:0,max:3,kind:'robot',available:false}];
assert.equal(ui.openPreparation(),true);panel=game.ui.panelOpen;const buy=panel.querySelectorAll('[data-buy]');assert.equal(buy[1].disabled,true,'unaffordable purchase stays disabled');assert.equal(buy[2].disabled,true,'authoritative unavailable affordable option stays disabled');buy[2].click();assert.notEqual(calls.at(-1)?.[1],'unowned-upgrade');buy[0].click();assert.deepEqual(calls.at(-1),['buy','robot']);
status={...status,stage:'wave',grace:0};ui.update();assert.equal(game.ui.panelOpen,null,'combat closes preparation shop');assert.equal(ui.openPreparation(),false);
status={...status,canShop:true};assert.equal(ui.openPreparation(),true,'native local canShop keeps console available after grace');game.ui.closePanel();ui.update();
assert.equal(ui.openInventory(),true);assert.ok(game.ui.panelOpen.textContent.includes('Shovel'),'native inventory custody appears');assert.ok(game.ui.panelOpen.textContent.includes('Overclocked barrel'),'current build appears');
const {setLang,t}=await import('../../src/core/i18n.js');const {endless41Text}=await import('../../src/ui/endless41_text.js');
for(const lang of ['tr','ru']){setLang(lang);assert.notEqual(endless41Text('Overclocked barrel'),'Overclocked barrel');assert.notEqual(endless41Text('Automatic pulse cooldown'),'Automatic pulse cooldown');assert.notEqual(endless41Text('Choose an upgrade'),'Choose an upgrade');assert.notEqual(t('Wave {n} approaches from the {@r} in {s} s.'),'Wave {n} approaches from the {@r} in {s} s.','native warning template registered in recipient language');ui.openInventory();assert.ok(!game.ui.panelOpen.textContent.includes('Overclocked barrel'),'current build uses local translated name');}
setLang('en');
enabled=false;ui.update();assert.equal(game.ui.panelOpen,null);assert.equal(hud.children[0].hidden,true,'normal game has no Endless status');
assert(!document.body.classList.contains('e41-mode'),'normal UI restores campaign dock scope');
ui.dispose();ui.dispose();assert.equal(root.children.length,0);assert.equal(hud.children.length,0);assert.equal(document.head.children.length,0,'owned style disposes');
assert.equal(before.includes('draft-a'),true);assert.equal(game.inventory.entries()[0].id,'native-1','presentation does not change native inventory');
let tracker,trackerUpdate,haulEndless=true;globalThis.KefalAPI={defineMod:m=>tracker=m};await import('../../public/mods/ship-loot-tracker.js');
document.getElementById=()=>null;const haulHud=new Node(),haulItem={id:'native-haul',type:'bolt',def:{kind:'scrap',name:'Bolt'},state:'world',obj:{position:{x:2,y:1,z:1}},value:31};
const haulGame={ui:{hud:{el:haulHud}},run:{phase:'moon',quota:330,sold:0,daysLeft:999},player:{inShip:true,dead:false},selfId:'crew',items:{all:()=>[haulItem]},remotes:new Map(),endless41:{active:()=>haulEndless}};
tracker.init({on:(_,fn)=>trackerUpdate=fn,t:s=>s,tf:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k])},{position:'above inventory',showMode:'in ship',includeHeld:true,colorByQuota:true,showBreakdown:true});trackerUpdate(.3,haulGame);
const haulHtml=haulHud.children.at(-1).innerHTML;assert.match(haulHtml,/LOOT ABOARD.*▮31/);assert.match(haulHtml,/1 item/);assert.match(haulHtml,/Bolt/);assert.doesNotMatch(haulHtml,/Company|QUOTA|to go|class="bar"|class="bad"/,'Endless native haul retains cargo without campaign rate/projection');
haulEndless=false;trackerUpdate(.3,haulGame);assert.match(haulHud.children.at(-1).innerHTML,/Company pays/,'normal native payout rows remain');assert.equal(haulItem.value,31);assert.equal(haulItem.state,'world');delete globalThis.KefalAPI;
console.log('endless41_ui: callback, stale offer, shop, inventory, mode and disposal checks pass');
