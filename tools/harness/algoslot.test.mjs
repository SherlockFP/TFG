// Node test for algoslot (wave 9): ONE Algorithm slot, ONE viewer number, quota/credits/route off the top bar.   node tools/harness/algoslot.test.mjs
import fs from 'node:fs';
import * as OG from '../../src/game/onegoal_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- pure rules
ok(OG.liveText(1470) === '● LIVE 1,470' && OG.liveText(12500) === '● LIVE 13K', 'liveText uses the one format');
ok(OG.liveDeltaText(300) === '+300' && OG.liveDeltaText(0) === '' && OG.liveDeltaText(-5) === '', 'delta pop');
ok(OG.calmDrop({ key: 'orbit_idle' }) && !OG.calmDrop({ key: 'orbit_idle' }, true) && !OG.calmDrop({ key: 'death' }) && !OG.calmDrop({ text: 'x' }), 'idle chatter dropped while calm');
ok(OG.reactKey('onair', 100, 0.1) === 'tagged' && OG.reactKey('death', 100, 0.1) === 'downed', 'events map to a reaction');
ok(OG.reactKey('onair', 10, 0.1) === null && OG.reactKey('onair', 100, 0.9) === null && OG.reactKey('vote', 100, 0.1) === null, 'reactions are rare');

// ---- ONE slot: the subtitle has no face / pink box / LIVE label of its own
const alg = rd('src/game/algorithm.js');
ok(!/algo-face|algo-who|<canvas/.test(alg.split('export function installAlgorithm')[1]), 'subtitle: no face card, no who/live header');
ok(!/linear-gradient\(90deg,rgba\(12,4,10/.test(alg) && !/border:1px solid rgba\(255,61,127/.test(alg), 'subtitle: no pink box');
ok(/-webkit-line-clamp:2/.test(alg), 'subtitle: max 2 lines');
ok(/OG\.calmDrop/.test(alg), 'subtitle: calm chatter gate');

// ---- ONE viewer number: only algoslot creates the strip; algo1 paints it; the report reads the same count
const slot = rd('src/game/algoslot.js'), a1 = rd('src/game/algo1.js');
ok((slot.match(/class="algo-live"/g) || []).length === 1 && !/class="algo-live"/.test(alg), 'exactly one LIVE element is built');
ok(/liveText\(S\.viewers\.n\)/.test(a1) && /game\.algo1\?\.viewers/.test(slot), 'strip + report use algo1 viewers');
ok(/'daySummary'/.test(slot) && /LIVE peak/.test(slot), 'report shows the same number (peak)');
ok(/installAlgoSlot/.test(rd('src/game/game.js')), 'module installed');

// ---- QUOTA / CREDITS / ROUTE left the top bar
const hud = rd('src/ui/hud.js'), term = rd('src/game/terminal.js'), calm = rd('src/game/hudcalm.js');
ok(!/t\('CREDITS'\)|t\('ROUTE'\)/.test(hud), 'hud.js: no CREDITS / ROUTE in the top bar');
ok(/t\('CREDITS'\)/.test(term) && /t\('ROUTE'\)/.test(term) && /term-head/.test(term), 'terminal header carries quota / credits / route');
ok(/t\('CREDITS'\)/.test(calm) && /t\('ROUTE'\)/.test(calm), 'Tab card carries credits / route');

// Actual installed callbacks with a minimal DOM; viewer state stays native.
class El {
 constructor(){this.children=[];this.style={};this.dataset={};this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),contains:k=>this.classes.has(k),toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};}
 set innerHTML(v){this.html=v;if(v.includes('algo-live')){this.num=new El();this.delta=new El();}}
 querySelector(s){return s==='.algo-live'?this.num:s==='.hud-live-d'?this.delta:null;}
 prepend(el){this.children.unshift(el);el.parentNode=this;}
 appendChild(el){this.children.push(el);el.parentNode=this;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(e=>e!==this);this.parentNode=null;}
}
globalThis.document={createElement:()=>new El(),head:new El(),documentElement:new El()};
const {installAlgoSlot,REACT}=await import('../../src/game/algoslot.js');
const {t,setLang}=await import('../../src/core/i18n.js');
for(const pool of Object.values(REACT))for(const [en,tr,ru] of pool){
 setLang('tr');ok(t(en)===tr,'surveillance reaction has exact Turkish translation');
 setLang('ru');ok(t(en)===ru,'surveillance reaction has exact Russian translation');
}
setLang('en');
const handlers=new Map(),tl=new El();let count=1470;
const game={selfId:'crew',run:{phase:'moon',fc:{p:{crew:[0,0,0],other:[100,1,1]}}},settings:{hudDensity:'standard'},player:{},algo1:{viewers:()=>count},ui:{hud:{el:{querySelector:()=>tl}}},mods:{on(k,f){handlers.set(k,f);return ()=>handlers.delete(k);}}};
const before=JSON.stringify(game.run),runtime=installAlgoSlot(game),tick=dt=>handlers.get('update')(dt,game);
tick(.5);ok(runtime.strip.hidden===true,'standard calm hides irrelevant LIVE even when another peer is exposed');
game.run.fc.p.crew=[25,0,0];tick(.5);ok(runtime.strip.hidden===false,'native local camera exposure reveals LIVE');
game.run.fc.p.crew=[0,0,1];tick(.5);ok(!runtime.strip.hidden,'tagged stays visible after meter clears');
game.run.fc.p.crew=[0,0,0];game.settings.hudDensity='minimal';tick(.5);ok(runtime.strip.hidden,'minimal calm hides LIVE');
handlers.get('tfg:viewers')({viewers:2000,reason:'escape',delta:530},{});tick(.5);ok(runtime.strip.hidden,'another game event cannot reveal strip');
count=2000;handlers.get('tfg:viewers')({viewers:count,reason:'escape',delta:530},game);tick(.5);ok(!runtime.strip.hidden,'real positive event shows temporary detail');
tick(3);ok(runtime.strip.hidden,'delta expires without ambient reappearance');
game.settings.hudDensity='full';tick(.5);ok(!runtime.strip.hidden,'full retains permanent viewer detail');
const summary=[];handlers.get('daySummary')({company:false},summary,game);ok(summary.join('').includes('2,000'),'native peak survives calm strip');
// The native Tab card hides its underlying HUD column, so detail belongs in the card.
globalThis.window={addEventListener(){},removeEventListener(){}};
document.body=new El();document.getElementById=()=>null;document.querySelectorAll=()=>[];
game.ui.hud.el.classList={contains:()=>false};
const {installHudCalm}=await import('../../src/game/hudcalm.js');
game.settings.hudDensity='standard';const calmRuntime=installHudCalm(game);
calmRuntime.showTab(true);const card=document.body.children[0];
ok(card.html.includes('LIVE 2,000'),'compact held-Tab card preserves actual viewer detail');
calmRuntime.showTab(false);game.settings.hudDensity='full';calmRuntime.showTab(true);
ok(card.html.includes('LIVE 2,000'),'full status also carries native viewer detail');
calmRuntime.dispose();
runtime.dispose();ok(handlers.size===0&&tl.children.length===0,'strip and event hooks dispose');
game.run.fc.p.crew=[0,0,0];ok(JSON.stringify(game.run)===before,'local presentation does not mutate camera/economy state');
if (fails) { console.error(fails + ' failed'); process.exit(1); }
console.log('algoslot ok');
