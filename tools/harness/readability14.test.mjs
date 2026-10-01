// Exercises the existing HUD queues without creating a parallel HUD or pretending to test rendered CSS.
import assert from 'node:assert/strict';
import { attentionHot, routineAttentionBusy, encounterObjectives as arrivalObjectives, toastUrgent, encounterObjectives } from '../../src/ui/hud_attention.js';
import { HUD } from '../../src/ui/hud.js';
assert.equal(attentionHot({player:{},director:{chaseLevel:()=>.2}}),false);
assert.equal(attentionHot({player:{},settings:{chattyAlgo:true},director:{chaseLevel:()=>.8}}),true);
assert.equal(attentionHot({player:{},chase:{tension:()=>.2}}),true);
assert.equal(attentionHot({player:{dead:true},director:{chaseLevel:()=>.8}}),false);
assert.equal(toastUrgent('bad'),true);assert.equal(toastUrgent('good'),false);
const rows=[{src:'guide',kind:'main',pin:true,text:'TUTORIAL 1/7: move controls'}, {src:'core',kind:'warn',text:'Evacuate'}, {src:'onboard',kind:'main',text:'Get scrap back to ship'}, {src:'guide',kind:'warn',text:'Emergency hint'}];
const dangerGame={player:{},director:{chaseLevel:()=>.8}};
assert.deepEqual(encounterObjectives(dangerGame,rows).map(r=>r.text),['Evacuate','Get scrap back to ship','Emergency hint']);
assert.equal(rows.length,4);dangerGame.director.chaseLevel=()=>0;assert.equal(encounterObjectives(dangerGame,rows),rows);
let chased=true,busy=false;
const h=Object.create(HUD.prototype);
h.game={player:{},director:{chaseLevel:()=>chased?.8:0}};h.cc={busy:()=>busy};h.gate=()=>false;h.pendingToasts=[];h.pendingBig=null;h.toastQ=[];h.nextFlush=0;
const shown=[];h.$={toasts:{children:[]}};
h.showToast=(...args)=>{shown.push(args);h.$.toasts.children.push(args);};
h.toast('Achievement claimed','good');assert.equal(shown.length,0);assert.equal(h.pendingToasts.length,1);
h.toast('Door closing','bad');assert.equal(shown.length,1);assert.equal(h.toastLimit(),1);
h.$.toasts.children=[];h.pendingToasts.push(['Evacuate','warn']);h.flushPending();assert.equal(shown.at(-1)[0],'Evacuate');assert.equal(h.pendingToasts[0][0],'Achievement claimed');
h.$.toasts.children=[];h.toastQ=[['Routine update','info',4000],['Incoming threat','bad',4000]];h.drainToastQ();assert.equal(shown.at(-1)[0],'Incoming threat');assert.equal(h.toastQ.length,1);
h.bigText('LEVEL UP!','Skill point','level');assert.equal(h.pendingBig,null);assert.ok(h.pendingToasts.some(p=>p[0].includes('LEVEL UP')));
h.bigText('New moon','Storm warning','moon');assert.equal(h.pendingBig[0],'New moon');
chased=false;h.pendingBig=null;h.$.toasts.children=[];h.toastQ=[];h.flushPending();assert.equal(shown.at(-1)[0],'Achievement claimed');assert.equal(h.toastLimit(),2);
h.$.toasts.children=[];busy=true;h.toast('Daily reward','good');assert.ok(h.pendingToasts.some(p=>p[0]==='Daily reward'));
console.log('readability14: chase and center-card pacing defer rewards, warning priority, one hot toast and level-up compaction passed');

const { stepObjective } = await import('../../src/game/guide_core.js');
const { TUT_STEPS } = await import('../../src/game/guide_data.js');
const light=TUT_STEPS.find(step=>step.id==='light');
for(const lang of ['en','tr','ru']) {
 const offer=stepObjective(light,lang,{price:19,key:'L'});assert.ok(offer.includes('19'));assert.ok(offer.includes('[L]'));assert.ok(!offer.includes('STORE'));
 const owned=stepObjective(light,lang,{hasFlashlight:true,key:'L'});assert.ok(owned.includes('[L]'));assert.ok(!owned.includes('19'));
 const bag=stepObjective(light,lang,{bagFlashlight:true,key:'L'});assert.ok(bag.includes('[I]'));assert.ok(bag.includes('[L]'));assert.notEqual(bag,owned);
}

const scrap=TUT_STEPS.find(step=>step.id==='scrap');assert.ok(/dock office/.test(stepObjective(scrap,'en',{docked:true})));assert.ok(/lever/.test(stepObjective(scrap,'en',{docked:false})));

// Wave 15: actual landing sequence transitions (not mutation of its private stage) respect encounter pacing.
const { LandingSeq } = await import('../../src/game/landing10_core.js');
const seq=new LandingSeq();seq.begin('seed|1|hamsi',0);seq.add('Crew assignment','info',1);seq.tick(10,{phase:'moon'});
assert.equal(seq.tick(12000,{phase:'moon',centerBusy:true,danger:true}),null);assert.equal(seq.stage,'wait');
const first=seq.tick(18000,{phase:'moon',danger:false});assert.equal(first.type,'show'); // safe again: the pending briefing becomes readable
assert.equal(seq.tick(19500,{phase:'moon',danger:true}).type,'pause');
assert.equal(seq.tick(24000,{phase:'moon',danger:true}),null);
const resumed=seq.tick(24500,{phase:'moon',danger:false});assert.equal(resumed.type,'resume');assert.ok(resumed.ms>0);assert.equal(resumed.lines[0].text,'Crew assignment');
assert.equal(seq.tick(24500+resumed.ms+1,{phase:'moon'}).type,'hide');
const leaving=new LandingSeq();leaving.begin('other',0,true);leaving.add('Briefing','info',1);leaving.tick(2000,{phase:'moon',danger:true});leaving.tick(3000,{phase:'takeoff',danger:true});assert.equal(leaving.holding(),false);
const long=new LandingSeq();long.begin('long',0,true);long.add('Old mission','info',1);long.tick(2000,{phase:'moon',danger:true});long.tick(46000,{phase:'moon',danger:true});assert.equal(long.holding(),false);

// The real mod-bus receives teammates' lamp state too: it must not complete our personal lesson.
const { installGuide } = await import('../../src/game/guide.js');
const events = new Map();
const guideGame = { profile: {}, player: { slots: ['local-lamp'] }, mods: { on(name, fn) { events.set(name, fn); return () => events.delete(name); }, commands: new Map() } };
const guide = installGuide(guideGame);
const beforeLamp = guide.tutorial().done;
events.get('itemState')({id:'remote-lamp',type:'flashlight',on:true});
events.get('itemState')({id:'floor-lamp',type:'proflash',on:true});
assert.equal(guide.tutorial().done,beforeLamp);assert.equal(guide.used('flashlight'),false);
events.get('itemState')({id:'local-lamp',type:'flashlight',on:false});assert.equal(guide.tutorial().done,beforeLamp);
let separateExpedition=true;guideGame.deadletter24={active:()=>separateExpedition};const beforeModeGuide=JSON.stringify(guide.tutorial());let modeGuideRows=[];events.get('objectives')((...args)=>modeGuideRows.push(args),guideGame,'deadletter');assert.equal(modeGuideRows.length,0);events.get('update')(120,guideGame);events.get('itemState')({id:'local-lamp',type:'flashlight',on:true});assert.equal(JSON.stringify(guide.tutorial()),beforeModeGuide,'mode event/poll cannot advance campaign tutorial');separateExpedition=false;delete guideGame.deadletter24;
events.get('itemState')({id:'local-lamp',type:'flashlight',on:true});assert.equal(guide.tutorial().done,beforeLamp+1);assert.equal(guide.used('flashlight'),true);
guide.dispose();

// Real HUD descent update: threat removes the card immediately and calm reuses the unread content.
const briefClasses = new Set(['hidden']), hudClasses = new Set();
const classList = set => ({contains:n=>set.has(n),add(...names){names.forEach(n=>set.add(n));},remove(...names){names.forEach(n=>set.delete(n));},toggle(n,on){on?set.add(n):set.delete(n);}});
const arrival = Object.create(HUD.prototype);arrival.el={classList:classList(hudClasses)};arrival.$={brief:{classList:classList(briefClasses)}};arrival.run={phase:'landing',moon:'hq',seed:12};
let built=0;arrival.buildBrief=()=>{built++;arrival.briefKey='hq|12|event';};
const descentGame={player:{},stateTimer:2,director:{chaseLevel:()=>0}};
arrival.updateBrief(.1,descentGame);assert.equal(built,1);assert.ok(hudClasses.has('hud-arrival-focus'));assert.ok(!briefClasses.has('hidden'));
descentGame.director.chaseLevel=()=>.8;arrival.updateBrief(.1,descentGame);assert.ok(briefClasses.has('hidden'));assert.ok(!briefClasses.has('out'));assert.ok(!hudClasses.has('hud-arrival-focus'));
descentGame.director.chaseLevel=()=>0;arrival.updateBrief(.1,descentGame);assert.equal(built,1);assert.ok(!briefClasses.has('hidden'));
const realSetTimeout=globalThis.setTimeout, realClearTimeout=globalThis.clearTimeout;
let finishFade;globalThis.setTimeout=fn=>{finishFade=fn;return 1;};globalThis.clearTimeout=()=>{};
try {
 arrival.run.phase='company';arrival.updateBrief(.1,descentGame);assert.ok(briefClasses.has('out'));assert.ok(!briefClasses.has('hidden'));assert.ok(hudClasses.has('hud-arrival-focus'));
 finishFade();assert.ok(briefClasses.has('hidden'));assert.ok(!hudClasses.has('hud-arrival-focus'));
 arrival.run.phase='landing';arrival.updateBrief(.1,descentGame);arrival.run.phase='company';arrival.updateBrief(.1,descentGame);assert.ok(briefClasses.has('out'));
 descentGame.director.chaseLevel=()=>.8;arrival.updateBrief(.1,descentGame);assert.ok(briefClasses.has('hidden'));assert.ok(!briefClasses.has('out'));assert.ok(!hudClasses.has('hud-arrival-focus'));assert.equal(arrival.briefPaused,false);
 finishFade();assert.ok(briefClasses.has('hidden'));
} finally {globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;}


// Optional Warden's real host/replica state must reach the shared attention gate without director pressure.
const ward={id:'c13',state:'warning',target:'self'};
const wardGame={selfId:'self',player:{},run:{phase:'moon',escape14:{result:'active',warden:'c13',target:'self'}},creatures:{host:new Map([['c13',ward]]),views:new Map()}};
for(const state of ['warning','chase','windup','attack','strike','search']) {ward.state=state;assert.equal(attentionHot(wardGame),true);}
for(const state of ['rest','watch','idle','stunned']) {ward.state=state;assert.equal(attentionHot(wardGame),false);}
ward.state='chase';ward.target='other';assert.equal(attentionHot(wardGame),false);ward.target='self';
wardGame.run.escape14.result='escaped';assert.equal(attentionHot(wardGame),false);wardGame.run.escape14.result='active';
wardGame.creatures.host.clear();wardGame.creatures.views.set('c13',{state:'chase',target:{x:0,z:0}});assert.equal(attentionHot(wardGame),true);
wardGame.run.escape14.target='other';assert.equal(attentionHot(wardGame),false);wardGame.run.escape14.target='self';wardGame.player.dead=true;assert.equal(attentionHot(wardGame),false);

// Real intercom show/update lifecycle, with native Warden pressure and a minimal DOM surface.
const { installAlgorithm } = await import('../../src/game/algorithm.js');
const oldDoc=globalThis.document;
const makeNode=()=>({classList:classList(new Set()),style:{},append(){},appendChild(){},remove(){},querySelector(){return makeNode();}});
globalThis.document={getElementById:()=>null,createElement:makeNode,createTextNode:text=>({textContent:text}),head:makeNode(),body:makeNode()};
try {
 wardGame.player.dead=false;wardGame.run.escape14.result='ready';wardGame.run.escape14.target='self';wardGame.settings={};
 const intercom=installAlgorithm({game:wardGame});
 intercom.show({text:'Inspect the service counter.',cls:'teach'});intercom.update(.1);assert.equal(intercom.speaking,true);
 wardGame.run.escape14.result='active';
 for(const state of ['warning','chase','search']) {wardGame.creatures.views.get('c13').state=state;intercom.update(.1);assert.equal(intercom.speaking,false);assert.equal(intercom.state.q.length,1);}
 intercom.show({text:'Threat approaching your position.',cls:'danger'});intercom.update(.1);assert.equal(intercom.state.cur.cls,'danger');
 intercom.update(10);assert.equal(intercom.speaking,false);assert.equal(intercom.state.q.length,1);
 wardGame.run.escape14.result='escaped';intercom.update(.1);assert.equal(intercom.state.cur.cls,'teach');assert.equal(intercom.state.cur.text,'Inspect the service counter.');
 intercom.dispose();const arrivalIntercom=installAlgorithm({game:wardGame});let cabinQuiet=true;wardGame.descent21={presentationBusy:()=>cabinQuiet};
 arrivalIntercom.show({text:'Optional salvage route.',cls:'teach'});arrivalIntercom.update(.1);assert.equal(arrivalIntercom.speaking,false,'actual installed intercom retains routine queue at lift arrival');
 arrivalIntercom.show({text:'Crew needs rescue.',cls:'danger'});arrivalIntercom.update(.1);assert.equal(arrivalIntercom.state.cur.cls,'danger','urgent intercom can pass deferred teaching');arrivalIntercom.update(10);
 cabinQuiet=false;arrivalIntercom.update(.1);assert.equal(arrivalIntercom.state.cur.text,'Optional salvage route.','same unread routine line resumes after leaving');delete wardGame.descent21;
 arrivalIntercom.dispose();wardGame.run.phase='company';let isolated=false;wardGame.deadletter24={active:()=>isolated};const modeIntercom=installAlgorithm({game:wardGame});
 modeIntercom.show({text:'Welcome employee. Walk to the field broker.',cls:'teach',ctx:'company',ttl:2});modeIntercom.update(.1);assert(modeIntercom.speaking);
 modeIntercom.show({text:'Choose a useful field tool.',cls:'teach',ctx:'company',ttl:2});isolated=true;wardGame.run.phase='deadletter';modeIntercom.update(100);assert.equal(modeIntercom.speaking,false);assert.equal(modeIntercom.state.q.length,2,'preexisting speech+queued campaign teaching survive mode context and original TTL');
 modeIntercom.show({text:'Immediate rescue required.',cls:'danger',ctx:'any',ttl:2});modeIntercom.update(.1);assert.equal(modeIntercom.state.cur.cls,'danger');modeIntercom.update(10);assert.equal(modeIntercom.speaking,false,'danger duration still advances normally');assert.equal(modeIntercom.state.q.length,2);
 isolated=false;wardGame.run.phase='company';modeIntercom.update(.1);const resumedText=modeIntercom.state.cur.text;assert.equal(resumedText,'Welcome employee. Walk to the field broker.','the actual already-speaking campaign tutorial resumes');modeIntercom.update(10);modeIntercom.update(.1);assert.notEqual(modeIntercom.state.cur?.text,resumedText,'suspended campaign line resumes only once');modeIntercom.dispose();isolated=false;wardGame.onboard={fr:{busy:()=>0}};const queuedDangerIntercom=installAlgorithm({game:wardGame});queuedDangerIntercom.show({text:'Archive clerks forgot your paperwork.',cls:'flavour',ctx:'company',ttl:20});queuedDangerIntercom.update(.1);assert(queuedDangerIntercom.speaking);queuedDangerIntercom.show({text:'Move away from immediate danger.',cls:'danger',ctx:'any',ttl:20});isolated=true;wardGame.run.phase='deadletter';wardGame.onboard.fr.busy=()=>10;queuedDangerIntercom.update(.1);assert.equal(queuedDangerIntercom.state.cur.cls,'danger','already queued urgent line leads held flavor even during arrival budget');assert(queuedDangerIntercom.state.q.some(line=>line.text==='Archive clerks forgot your paperwork.'));queuedDangerIntercom.dispose();delete wardGame.onboard;delete wardGame.deadletter24;

} finally {if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;}

// Installed HUD: unchanged frames must not replace status text nodes or stable bars repeatedly.
const prevDocument=globalThis.document,prevWindow=globalThis.window;
let textWrites=0,styleWrites=0;
const domNode=()=>{const classes=new Set(),cache=new Map();let text='';return {children:[],offsetHeight:0,childElementCount:0,classList:classList(classes),style:new Proxy({},{set(o,k,v){styleWrites++;o[k]=v;return true;}}),setAttribute(){},appendChild(n){n.parent=this;this.children.push(n);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},querySelector(s){if(!cache.has(s))cache.set(s,domNode());return cache.get(s);},querySelectorAll(){return [];},getContext(){return {};},getBoundingClientRect(){return {bottom:this.rectBottom||0,height:0};},getClientRects(){return [];},get textContent(){return text;},set textContent(v){textWrites++;text=String(v);}};};
globalThis.document={documentElement:{dataset:{hud:'standard'}},createElement:domNode,createTextNode:text=>({textContent:text}),head:domNode(),getElementById:()=>null};globalThis.window={innerWidth:960,innerHeight:540};
try {
 const mounted=new HUD(domNode());
 const stable={player:{hp:100,maxHp:100,stamina:100,maxStamina:100,carryWeight:()=>4,inShip:true,slots:[]},run:{phase:'moon',moon:'hamsi',time:480,seed:1,credits:0},profile:{level:1,xp:0,coins:0,skillPoints:0},stats:{carryRelief:0},world:{},voice:{transmitting:false,localLevel:0},settings:{}};
 mounted.setRun(stable.run);mounted.update(1/60,stable);textWrites=0;styleWrites=0;
 for(let n=0;n<300;n++)mounted.update(1/60,stable);
 console.log('HUD unchanged-frame writes:',JSON.stringify({frames:300,textWrites,styleWrites}));
 assert.equal(textWrites,0,'stable status labels must not replace text nodes every frame');
 assert.equal(styleWrites,0,'stable health/bars/crosshair must not rewrite styles every frame');
 stable.player.hp=10;stable.player.stamina=50;stable.profile.level=2;stable.profile.skillPoints=1;stable.profile.xp=20;stable.run.time=600;
 mounted.update(1/60,stable);assert.ok(textWrites>0);assert.ok(styleWrites>0);assert.equal(mounted.$.lvl.textContent,'Lv.2');assert.match(mounted.$.rank.textContent,/\(\+1\)/);assert.notEqual(mounted.$.clockTime.textContent,'8:00 AM');assert.equal(mounted.$.stam.style.width,'50%');
 let localArrival=true,realChase=false;stable.descent21={presentationBusy:()=>localArrival};stable.director={chaseLevel:()=>realChase?.8:0};
 mounted.update(1/60,stable);mounted.toast('Lift safety warning','warn');mounted.toast('Crew needs rescue','bad');assert.equal(mounted.$.toasts.children.length,2);
 realChase=true;mounted.update(1/60,stable);assert.equal(mounted.$.toasts.children.length,1,'real danger entry inside existing safe-arrival quiet trims visible warnings');assert.ok(mounted.toastQ.some(p=>p[0]==='Crew needs rescue'),'second unread warning is retained');
 realChase=false;mounted.update(1/60,stable);assert.equal(mounted.toastLimit(),2);assert.equal(mounted.$.toasts.children.length,2,'native safe capacity restores deferred warning without loss');
 for(const warning of [...mounted.$.toasts.children]){clearTimeout(warning._t1);clearTimeout(warning._t2);warning.remove();}localArrival=false;
 globalThis.window.innerHeight=720;mounted.el.querySelector('.hud-tr').rectBottom=140;for(let n=0;n<8;n++)mounted.update(1/60,stable);assert.equal(mounted.$.xpfeed.style.top,'148px','status cache does not bypass existing resize/layout measurement');
} finally {if(prevDocument===undefined)delete globalThis.document;else globalThis.document=prevDocument;if(prevWindow===undefined)delete globalThis.window;else globalThis.window=prevWindow;}

// Presentation pacing uses the actual HUD queue; urgent messages still pass without combat.
let liftArrival=true;h.game={player:{},descent21:{presentationBusy:()=>liftArrival}};busy=false;h.pendingToasts=[];h.toastQ=[];h.pendingBig=null;h.$.toasts.children=[];h.nextFlush=0;
assert.equal(attentionHot(h.game),false);assert.equal(routineAttentionBusy(h.game),true);
h.toast('Depth 2 / Tier 1. Quiet archive','info');h.toast('Optional job reward','good');assert.equal(h.pendingToasts.length,2);
h.toast('Recover downed crew','warn');assert.equal(shown.at(-1)[0],'Recover downed crew');assert.equal(h.toastLimit(),2,'arrival retains ordinary warning capacity');
assert.deepEqual(arrivalObjectives(h.game,rows).map(r=>r.text),['Evacuate','Emergency hint']);
h.$.toasts.children=[];liftArrival=false;h.flushPending();assert.equal(shown.at(-1)[0],'Depth 2 / Tier 1. Quiet archive');assert.equal(h.pendingToasts.length,1);
console.log('readability23: local presentation defers native routine queue, preserves urgent warning, releases unread cue');

// Temporary mode must not record permanent Codex discoveries; prior native notifications retain queue pacing.
const {installCollection}=await import('../../src/game/collection.js');
const collectionHooks=new Map();let modeIntro=true;const collectionGame={profile:{},player:{indoor:true,dead:false},world:{seed:1,facility:{layout:{theme:'deadletter24'}}},run:{phase:'deadletter',moon:'deadletter24'},deadletter24:{presentationQuiet:()=>modeIntro},mods:{on(k,f){collectionHooks.set(k,f);return()=>collectionHooks.delete(k);}},ui:{toast:(...a)=>h.toast(...a)},progress:{save(){}}};
h.game=collectionGame;h.pendingToasts=[];h.toastQ=[];h.$.toasts.children=[];h.nextFlush=0;const nativeCodex=installCollection(collectionGame);collectionHooks.get('update')(.1,collectionGame);assert.equal(h.pendingToasts.length,0,'temporary mode cannot emit a permanent Codex discovery');assert.equal(collectionGame.profile.codex.interiors.deadletter24,undefined);
h.toast('Prior campaign notice','info');assert.equal(h.pendingToasts.length,1);h.toast('Recover crew','warn');assert.equal(shown.at(-1)[0],'Recover crew');h.$.toasts.children=[];modeIntro=false;collectionGame.run.phase='company';h.flushPending();assert.equal(h.pendingToasts.length,0);assert.equal(shown.at(-1)[0],'Prior campaign notice','same unread campaign notice resumes after mode');
collectionGame.run.phase='moon';collectionGame.world.facility.layout.theme='office';collectionHooks.get('update')(.1,collectionGame);assert(collectionGame.profile.codex.interiors.office,'native campaign discovery resumes outside temporary mode');assert.match(shown.at(-1)[0],/Codex|Kodeks|Кодекс|interior/);nativeCodex.dispose();

const modeGoalGame={player:{},deadletter24:{active:()=>true,presentationQuiet:()=>true}};const modeGoalRows=[...rows,{src:'deadletter24',kind:'main',text:'Dead Letter /1'},{src:'deadletter24',kind:'sub',text:'LMB: throw cards. R: change special.'}];assert.deepEqual(arrivalObjectives(modeGoalGame,modeGoalRows).map(r=>r.text),['Evacuate','Emergency hint','Dead Letter /1','LMB: throw cards. R: change special.'],'intro keeps its own2modecues while ordinarycampaign rowswait');

// Objective collection→installed OneGoal display policy, not just producer row count.
const {Emitter}=await import('../../src/core/events.js'),{installOneGoal}=await import('../../src/game/onegoal.js'),{Objectives}=await import('../../src/game/objectives.js');
const policyMods=new Emitter();let modeActive=true,needRescue=false;const policyGame={mods:policyMods,profile:{},settings:{},player:{dead:false},run:{phase:'deadletter',moon:'deadletter24'},items:{inShipItems:()=>[]},deadletter24:{active:()=>modeActive,presentationQuiet:()=>false}};
const modeObjectiveProducer=(add)=>{add('Dead Letter /1 /Archive entry','main');add(needRescue?'Recover crew [E]':'LMB: throw cards. R: change special.',needRescue?'warn':'sub');};modeObjectiveProducer._src='deadletter24';policyMods.on('objectives',modeObjectiveProducer);policyGame.onegoal=installOneGoal(policyGame);const objectiveTracker=Object.create(Objectives.prototype);objectiveTracker.game=policyGame;
for(const density of ['standard','full'])assert.deepEqual(policyGame.onegoal.shown(objectiveTracker.compute(),density).map(l=>l.text),['Dead Letter /1 /Archive entry','LMB: throw cards. R: change special.']);
assert.equal(policyGame.onegoal.shown(objectiveTracker.compute(),'minimal').length,1);needRescue=true;for(const density of ['standard','full','minimal'])assert.equal(policyGame.onegoal.shown(objectiveTracker.compute(),density)[0].text,'Recover crew [E]');
modeActive=false;assert.deepEqual(policyGame.onegoal.shown(rows,'standard').map(l=>l.text),['Evacuate','Get scrap back to ship']);policyGame.onegoal.dispose();
