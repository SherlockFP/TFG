// Exercises the existing HUD queues without creating a parallel HUD or pretending to test rendered CSS.
import assert from 'node:assert/strict';
import { attentionHot, toastUrgent, encounterObjectives } from '../../src/ui/hud_attention.js';
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
events.get('itemState')({id:'local-lamp',type:'flashlight',on:true});assert.equal(guide.tutorial().done,beforeLamp+1);assert.equal(guide.used('flashlight'),true);
guide.dispose();
