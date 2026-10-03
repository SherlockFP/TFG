import assert from 'node:assert/strict';
import {makeNativeArena32} from './creatures32_arena.mjs';
import {G} from '../../src/physics/physics.js';
import {creatureOptsFromView} from '../../src/game/hostmig_core.js';
import {CreatureManager,STATE_SOUNDS} from '../../src/entities/creatures.js';
import {Session} from '../../src/net/session.js';
import {hostMethods} from '../../src/game/host.js';
import {saveRun,loadRun} from '../../src/core/save.js';
import {installDescent21Threats} from '../../src/game/descent21_threats.js';
import {installGrenades} from '../../src/game/grenades.js';
import {installBalanceRules} from '../../src/game/balance_rules.js';
import {register} from 'node:module';
async function check(name,fn){const a=await makeNativeArena32();try{await fn(a);console.log('PASS',name);}finally{a.dispose();}}
const wait=(a,c,state,seconds=20)=>{for(let i=0;i<seconds*60&&c.state!==state;i++)a.step();assert.equal(c.state,state,`native reaches ${state}`);};
const flash=a=>{a.player.flash=true;a.player.look.copy(a.fixture.axis).negate();};
function panel(a,forward,width=3,member=G.STATIC){const p=a.fixture.at(forward);return a.physics.addStaticBox(p.x,p.y+1.3,p.z,a.fixture.axis.z?width:.04,1.3,a.fixture.axis.x?width:.04,0,member);}
function attackStack32(a){
 // Presentation-only DOM fixture; manager, grenade/balance modules, hurt delivery and geometry are native.
 const create=document.createElement.bind(document),rawAttack=a.manager.attack;
 const element=()=>Object.assign(create(),{dataset:{},children:[],appendChild(n){this.children.push(n);return n;},append(...ns){this.children.push(...ns);},insertBefore(n){this.children.push(n);},querySelector:()=>null,remove(){}});
 document.createElement=element;Object.assign(document,{head:element(),body:element(),getElementById:()=>null,querySelector:()=>null});
 a.game.camera=a.game.engine.camera;const received=[],pending=[],scheduled=[];
 a.game.hostHurtPlayer=hostMethods.hostHurtPlayer;a.game.net.on_('hurt',d=>received.push(d));
 // Timer fixture deadlines use the arena's sole game.time; no wall clock or injected attack outcome.
 a.game.later=(fn,ms)=>{const timer={fn,at:a.game.time+ms/1000};pending.push(timer);scheduled.push(timer);return timer;};
 const balance=a.game.balRules=installBalanceRules(a.game),hudTimers=[],nativeInterval=globalThis.setInterval;let grenades;
 // The real HUD owns a shared presentation interval; retain its handle so fixture teardown cannot leave it reading removed DOM.
 globalThis.setInterval=(...args)=>{const id=nativeInterval(...args);hudTimers.push(id);return id;};
 try{grenades=installGrenades(a.game);}finally{globalThis.setInterval=nativeInterval;}
 a.game.mods.emit('netReady',a.game.net,a.game);
 function advance(seconds){for(let elapsed=0;elapsed<seconds-1e-8;){const dt=Math.min(1/60,seconds-elapsed);a.step(dt);a.game.mods.emit('update',dt,a.game);for(let i=pending.length-1;i>=0;i--)if(pending[i].at<=a.game.time+1e-8){const timer=pending.splice(i,1)[0];timer.fn();}elapsed+=dt;}}
 return{received,pending,scheduled,grenades,advance,dispose(){grenades.dispose();balance.dispose();pending.length=0;for(const id of hudTimers)clearInterval(id);assert.equal(a.manager.attack,rawAttack,'native grenade disposal restores original attack');}};
}
for(const type of ['c32_dormant','c32_ram'])await check(`${type} authored warning hits once through real grenades / balance / Session`,a=>{
 const stack=attackStack32(a);try{
  const c=a.spawn(type);if(type==='c32_dormant')flash(a);else a.player.noise=.5;
  wait(a,c,type==='c32_dormant'?'windup':'charge');wait(a,c,'rest');
  assert.equal(stack.received.length,1,'completed authored warning immediately delivers one native hurt');assert.equal(stack.received[0].from,c.id);assert(stack.received[0].dmg>0&&stack.received[0].dmg<=35);
  assert.equal(stack.scheduled.length,0,'completed authored warning must not schedule another generic warning');a.player.flash=false;a.player.noise=0;stack.advance(1);assert.equal(stack.received.length,1);assert.equal(stack.pending.length,0);
 }finally{stack.dispose();}
});
for(const blackout of [false,true])await check(`ordinary delayed attack through real grenades / balance${blackout?' / actual blackout bonus once':''}`,a=>{
 const stack=attackStack32(a);try{
  const c=CreatureManager.prototype.hostSpawn.call(a.manager,'lurker',a.fixture.ramStart,{zone:'in',level:1,elite:false,variant:null,affix:null,tier:null,yaw:a.fixture.yaw});a.advance(1.1);
  if(blackout){stack.grenades.spawn('blackout',c.pos.clone().setY(c.pos.y+.2),c.pos.clone().set(0,0,0),'crew',.3);stack.advance(.35);assert.equal(stack.grenades.stats().dark,1,'real grenade detonation creates native blackout zone');}
  // Fresh native attack state is setup for testing the generic gate, not a simulated contact result.
  c.setState('attack');a.manager.attack(c,a.player,20,'lurker');assert.equal(stack.received.length,0);assert.equal(stack.scheduled.length,1);stack.advance(.39);assert.equal(stack.received.length,0);stack.advance(.03);
  assert.equal(stack.received.length,1,'native delayed replay delivers one hurt');assert.equal(stack.received[0].dmg,blackout?25:20,'blackout applies exactly once');assert.equal(stack.pending.length,0);
  a.manager.attack(c,a.player,20,'lurker');assert.equal(stack.received.length,1,'ordinary repeated call still obeys native minGap');assert.equal(stack.scheduled.length,1);stack.advance(.3);assert.equal(stack.received.length,1);
 }finally{stack.dispose();}
});
await check('dormant quiet bypass / full wake / controller withdrawal',a=>{
 assert(a.local.forward().dot(a.fixture.axis.clone().negate())>.99,'native first-person fixture looks towards the creature lane');
 const c=a.spawn('c32_dormant');a.advance(3);assert.equal(c.state,'idle');assert.equal(a.hits.length,0);
 flash(a);a.advance(1);assert.equal(c.state,'wake');assert.equal(a.hits.length,0);
 a.player.flash=false;a.walkPlayerTo(a.fixture.quietBypass);a.advance(1.6);assert.equal(a.hits.length,0);assert.equal(c.state,'rest');
});
await check('thin native panel prevents sustained flashlight and noise trigger',a=>{
 const c=a.spawn('c32_dormant');const wall=panel(a,4.5);flash(a);a.player.noise=1;a.advance(3);assert.equal(c.state,'idle');assert.equal(a.hits.length,0);a.physics.removeCollider(wall);
});
await check('dormant positive swipe / callback reentry consumes episode first',a=>{
 const c=a.spawn('c32_dormant');flash(a);a.game.onHit=()=>a.manager.hostUpdate(1/60);wait(a,c,'windup');a.advance(.79);assert.equal(a.hits.length,0);a.advance(.03);assert.equal(a.hits.length,1);assert.equal(c.state,'rest');a.advance(3.8);assert.equal(a.hits.length,1);
});
for(const reason of ['downed','dead','inShip','leave','cover'])await check(`dormant swipe cancels ${reason}`,a=>{
 const c=a.spawn('c32_dormant');flash(a);wait(a,c,'windup');let wall;
 if(reason==='leave'){a.players.length=0;a.game.net.players.delete('crew');}else if(reason==='cover'){const along=(c.pos.x-a.fixture.ramStart.x)*a.fixture.axis.x+(c.pos.z-a.fixture.ramStart.z)*a.fixture.axis.z;wall=panel(a,(along+6)/2);}else a.player[reason]=true;
 a.advance(1);assert.equal(a.hits.length,0);assert.equal(c.state,'rest');if(wall)a.physics.removeCollider(wall);
});
await check('native stun cancels dormant warning and clears old hit marker',a=>{
 const c=a.spawn('c32_dormant');flash(a);wait(a,c,'windup');a.manager.damage(c.id,1,'crew',{stun:1});a.player.flash=false;a.player.noise=0;a.advance(2);assert.equal(a.hits.length,0);assert.equal(c.state,'rest');assert.equal(c.data.hitBy,null);
});
await check('ram gives 1.4 seconds then fixed-axis controller sidestep',a=>{
 const c=a.spawn('c32_ram');a.player.noise=.5;wait(a,c,'windup');const yaw=c.yaw;a.advance(.4);a.walkPlayerTo(a.fixture.right);assert.equal(c.yaw,yaw);a.advance(.5);assert.equal(a.hits.length,0);wait(a,c,'charge');a.advance(1.3);assert.equal(c.yaw,yaw);assert.equal(a.hits.length,0);assert.equal(c.state,'rest');
});
await check('ram native swept first capsule / one hit at large dt / reentry',a=>{
 const second={...a.player,id:'second',pos:a.fixture.at(4),eye:a.fixture.at(4).add({x:0,y:1.62,z:0}),noise:0};a.players.push(second);a.game.net.players.set(second.id,{id:second.id});
 const c=a.spawn('c32_ram');a.player.noise=.5;wait(a,c,'windup');a.advance(1.39);assert.equal(a.hits.length,0);wait(a,c,'charge');a.game.onHit=()=>a.manager.hostUpdate(.25);
 for(let i=0;i<5&&a.hits.length===0;i++)a.step(.25);assert.equal(a.hits.length,1);assert.equal(a.hits[0].id,'second');assert.equal(c.state,'rest');a.advance(2.4);assert.equal(a.hits.length,1);
});
for(const member of [G.STATIC,G.DOOR])await check(`ram large-dt ${member===G.DOOR?'door':'thin panel'} sweep precedes player`,a=>{
 const c=a.spawn('c32_ram');a.player.noise=.5;wait(a,c,'charge');const before=c.pos.clone(),wall=panel(a,1.2,3,member);a.step(.25);assert.equal(c.state,'rest');assert.equal(a.hits.length,0);assert(c.pos.distanceTo(before)<.72);a.physics.removeCollider(wall);
});
for(const state of ['windup','charge'])await check(`ram native stun cancels ${state}`,a=>{
 const c=a.spawn('c32_ram');a.player.noise=.5;wait(a,c,state);a.manager.damage(c.id,1,'crew',{stun:1});a.advance(3.4);assert.equal(c.state,'rest');assert.equal(a.hits.length,0);a.advance(.12);wait(a,c,'windup');a.advance(1.39);assert.equal(a.hits.length,0);
});
await check('ram carried native cargo trigger / bagged custody preservation',a=>{
 const id=a.items.hostSpawn('copper',a.player.pos.clone(),{value:30}),item=a.items.get(id),c=a.spawn('c32_ram');a.advance(2);assert.equal(c.state,'idle');item.setHeld('crew');item.inv={k:'bag'};a.advance(2);assert.equal(c.state,'idle');item.inv=null;wait(a,c,'windup');
 const held={id:item.id,holder:item.holder,inv:item.inv,body:item.body};wait(a,c,'charge');a.advance(1);assert.equal(a.hits.length,1);for(const k of Object.keys(held))assert.equal(item[k],held[k]);
});
for(const type of ['c32_dormant','c32_ram'])await check(`${type} crew JIP cancels warning`,a=>{
 const c=a.spawn(type);if(type==='c32_ram')a.player.noise=.5;else flash(a);wait(a,c,type==='c32_ram'?'windup':'wake');a.game.net.players.set('newCrew',{id:'newCrew'});a.step();assert.equal(c.state,'rest');a.advance(2.4);assert.equal(a.hits.length,0);
});
for(const type of ['c32_dormant','c32_ram'])await check(`${type} native view migration identity / HP / safe full recovery`,a=>{
 const c=a.spawn(type);if(type==='c32_ram')a.player.noise=.5;else flash(a);wait(a,c,type==='c32_ram'?'charge':'wake');const view=a.manager.views.get(c.id);view.hp=37;const opts=creatureOptsFromView(view,a.fixture.ramStart.y);a.manager.host.delete(c.id);
 const restored=a.manager.hostSpawn(type,view.target,opts);assert(restored);restored.hp=view.hp;a.game.mods.emit('hostMigrated',a.game,{self:true});assert.equal(restored.id,c.id);assert.equal(restored.hp,37);assert.equal(restored.state,'rest');a.advance(2.5);assert.equal(a.hits.length,0);
});
await check('actual Session peer cs warning / duplicate row one cue / no peer AI damage',a=>{
 const c=a.spawn('c32_ram');const peerNet=new Session({strategy:'local',isHost:false,code:'peer32'});peerNet.hostId='crew';peerNet.selfId='peer';const peerCues=[],peerGame={...a.game,isHost:false,selfId:'peer',net:peerNet,audio:{has:()=>true,play(id){peerCues.push(id);return{stop(){}};}}},peer=new CreatureManager(peerGame);peerGame.creatures=peer;
 const old=STATE_SOUNDS.c32_ram;STATE_SOUNDS.c32_ram={windup:['c32_ram_brake',.5]};peerNet.on_('cev',d=>peer.onEvent(d));peerNet.on_('cs',d=>peer.applySnapshot(d));
 a.game.net.transport.peers.add('peer');a.game.net.transport.send=(m)=>peerNet.receive(m,'crew');a.game.net.sendTo('peer','cev',a.manager.serializeFor()[0]);a.game.net.flush();
 a.player.noise=.5;wait(a,c,'windup');a.game.net.sendRows('cs',a.manager.snapshot(),{keyframe:0});a.game.net.flush();assert.equal(peer.views.get(c.id).state,'windup');assert.equal(peer.views.get(c.id).targetYaw,+c.yaw.toFixed(2));assert.equal(peerCues.length,1);
 a.game.net.send('cs',a.manager.snapshot());a.game.net.flush();assert.equal(peerCues.length,1);peer.hostUpdate(2);assert.equal(peer.host.size,0);assert.equal(a.hits.length,0);peer.clearAll();peerNet.transport.leave();STATE_SOUNDS.c32_ram=old;
});
await check('default-disabled manager admission vetoes scripted/data bypass',a=>{
 const c=a.manager.hostSpawn('c32_ram',a.fixture.ramStart,{zone:'in',scripted:true,data:{owned:true}});assert.equal(c,null);assert.equal(a.game.hostData.powerUsed,0);assert.deepEqual(a.game.run.creatures32SeenFloors,[]);
});
function natural(a){
 a.game.config.creatures32=true;a.setupPlayer(a.game.world.facility.mainDoor.spawn);a.game.time=30;a.game.run.descent21.currentChoice={seed:1235,theme:'factory',size:1.3};
 const api=a.game.descentThreat21=installDescent21Threats(a.game);for(let n=1;n<100;n++){a.game.run.day=n;a.game.run.descent21.token=`hamsi:1235:${n}`;if(a.api.choice())break;}assert(a.api.choice(),'fixture finds eligible stable 25% floor roll');return api;
}
await check('native indoor admission / self-delivery reentry / immutable receipt / save and diff sync',a=>{
 const depth=natural(a),original=a.game.run.creatures32SeenFloors;let nested,events=0;a.game.onSpawnEvent=d=>{if(d.e==='sp'&&d.ty.startsWith('c32_')){events++;assert.equal(a.game.run.creatures32SeenFloors.length,1,'receipt published before spawn callback');nested=a.game.hostSpawnCreatureIndoor(d.ty);}};
 const result=a.game.hostSpawnCreatureIndoor('c32_dormant');assert.equal(result,true,'real generated map has a safe naturally admitted room');if(result)a.game.hostData.powerUsed+=2;
 assert.equal(nested,false);assert.equal(events,1);assert.equal(a.manager.host.size,1);assert.equal(a.game.hostData.powerUsed,2);assert.equal(original.length,0);assert.notEqual(a.game.run.creatures32SeenFloors,original);assert(Object.isFrozen(a.game.run.creatures32SeenFloors));assert.equal(a.game.run.creatures32SeenFloors.length,1);
 const order=a.messages.filter(m=>m.k==='gs'||m.d.e==='sp');assert.equal(order[0].k,'gs');assert.equal(order[1].d.e,'sp');
 const old=globalThis.localStorage,memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};try{saveRun(1,a.game.run);const restored=loadRun(1);assert.deepEqual(restored.creatures32SeenFloors,a.game.run.creatures32SeenFloors);a.game.run=restored;}finally{globalThis.localStorage=old;}
 for(const c of a.manager.host.values())a.manager.hostRemove(c.id);assert.equal(a.game.hostSpawnCreatureIndoor('c32_ram'),false,'native reload/return cannot replay floor receipt');depth.dispose();
});
for(const mode of ['config','depth0','depth1','depth2','quota0','quota1','liminal','company','deadletter','mission','escape','arrival','power','family','capacity','capsule','single-exit','narrow'])await check(`admission veto ${mode}`,a=>{
 const depth=natural(a);const run=a.game.run,chosen=a.api.choice(),F=a.game.world.facility;let restore=()=>{},wall;
 if(mode==='config')a.game.config.creatures32=false;
 if(mode.startsWith('depth'))run.descent21.depth=+mode.slice(5);
 if(mode.startsWith('quota'))run.quotaIndex=+mode.slice(5);
 if(mode==='liminal')F.layout.theme='backrooms';if(mode==='company')run.phase='company';if(mode==='deadletter')a.game.deadletter24={active:()=>true};if(mode==='mission')a.game.missions14={active:()=>true};if(mode==='escape')a.game.escape14={active:()=>true};
 if(mode==='arrival')a.game.mods.emit('facilityChanged',a.game);if(mode==='power')a.game.hostData.powerUsed=20;if(mode==='family')a.spawn(chosen);if(mode==='capacity')run.creatures32SeenFloors=Object.freeze(Array.from({length:128},(_,i)=>`old:${i}`));
 if(mode==='capsule'||mode==='narrow'){const old=F.scrapSpots;F.scrapSpots=[{...a.fixture.ramStart,room:a.fixture.room}];const rooms=F.layout.rooms,r=rooms[a.fixture.room],L=F.layout,cx=L.ox+(r.x+r.w/2)*L.cell,cz=L.oz+(r.z+r.h/2)*L.cell;F.layout.rooms=rooms.map((r,i)=>i===a.fixture.room?r:{...r,type:'entrance'});
  const boxes=mode==='capsule'?[a.physics.addStaticBox(cx,L.y+1.3,cz,r.w*L.cell/2,1.3,r.h*L.cell/2)]:[-1,1].map(side=>a.physics.addStaticBox(cx,L.y+1.3,cz+side*(r.h*L.cell/4+.35),r.w*L.cell/2,1.3,r.h*L.cell/4-.35));
  a.physics.step(1/60);restore=()=>{for(const b of boxes)a.physics.removeCollider(b);F.scrapSpots=old;F.layout.rooms=rooms;};}
 if(mode==='single-exit'){const edges=F.layout.edgeInfo;F.layout.edgeInfo=new Map([...edges].filter(([,e])=>e.type==='entrance'));restore=()=>{F.layout.edgeInfo=edges;};}
 const count=a.manager.host.size,receipts=run.creatures32SeenFloors,power=a.game.hostData.powerUsed;assert.equal(a.game.hostSpawnCreatureIndoor('c32_dormant'),false);assert.equal(a.manager.host.size,count);assert.equal(run.creatures32SeenFloors,receipts);assert.equal(a.game.hostData.powerUsed,power);assert.equal(a.manager.hostSpawn(chosen,a.fixture.ramStart,{data:{owned:true},scripted:true,zone:'in'}),null);if(wall)a.physics.removeCollider(wall);restore();depth.dispose();
});
await check('spawn callback removal still consumes successful floor receipt',a=>{
 const depth=natural(a);a.game.onSpawnEvent=d=>{if(d.e==='sp'&&d.ty.startsWith('c32_'))a.manager.hostRemove(d.id);};a.game.hostSpawnCreatureIndoor('c32_ram');assert.equal(a.manager.host.size,0);assert.equal(a.game.run.creatures32SeenFloors.length,1);assert.equal(a.game.hostSpawnCreatureIndoor('c32_ram'),false);depth.dispose();
});
await check('native first-frame weapon hit provokes full dormant warning',a=>{
 const c=a.spawn('c32_dormant');a.manager.damage(c.id,1,'crew');a.step();assert.equal(c.state,'wake');assert.equal(a.hits.length,0);a.advance(1.49);assert.equal(a.hits.length,0);
});
await check('existing native crawler chase blocks a new dormant encounter',a=>{
 const crawler=CreatureManager.prototype.hostSpawn.call(a.manager,'crawler',a.fixture.ramStart,{level:1,elite:false,variant:null,affix:null,zone:'in',yaw:a.fixture.yaw});const c=a.spawn('c32_dormant');flash(a);a.advance(1.1);assert(crawler.target);assert.equal(c.state,'idle');
});
for(const reason of ['downed','dead','inShip','leave'])for(const state of ['windup','charge'])await check(`ram ${state} cancels native ${reason}`,a=>{
 const c=a.spawn('c32_ram');a.player.noise=.5;wait(a,c,state);if(reason==='leave'){a.players.length=0;a.game.net.players.delete('crew');}else a.player[reason]=true;a.step(.25);assert.equal(a.hits.length,0);assert.equal(c.state,'rest');
});
await check('ram charge obeys eight-metre and 1.25-second budgets with no recovery hit',a=>{
 const c=a.spawn('c32_ram');a.player.noise=.5;wait(a,c,'windup');a.walkPlayerTo(a.fixture.right);wait(a,c,'charge');const start=c.pos.clone(),chargeAt=a.game.time;for(let i=0;i<6&&c.state==='charge';i++)a.step(.25);assert.equal(c.state,'rest');assert(c.pos.distanceTo(start)<=8+.001);assert(a.game.time-chargeAt<=1.25+.001);assert.equal(a.hits.length,0);a.advance(2.4);assert.equal(c.state,'rest');
});
await check('final native host damage cap follows high-level / balance scaling',a=>{
 const c=a.spawn('c32_ram',{level:99});a.game.balance={hitDamage:()=>999};const delivered=[];a.game.net.on_('hurt',d=>delivered.push(d));hostMethods.hostHurtPlayer.call(a.game,'crew',c.dmg,c.type,c.id,c.pos);assert.equal(delivered.length,1);assert.equal(delivered[0].dmg,35);assert(100-delivered[0].dmg>0);hostMethods.hostHurtPlayer.call(a.game,'crew',75,'environment');assert.equal(delivered[1].dmg,75);
});
for(const failure of ['null','throw'])await check(`native ${failure} spawn rolls back only own receipt / reservation`,a=>{
 const depth=natural(a),before=a.game.run.creatures32SeenFloors;a.game.net.on_('gs',d=>{a.messages.push({k:'gs',d:structuredClone(d)});if(d.creatures32SeenFloors?.length){if(failure==='null')a.game.descentThreat21.allowSpawn=()=>false;else a.game.forge={creatureOpts(){throw new Error('fixture native forge failure');}};}});
 if(failure==='throw')assert.throws(()=>a.game.hostSpawnCreatureIndoor('c32_ram'),/fixture native forge failure/);else assert.equal(a.game.hostSpawnCreatureIndoor('c32_ram'),false);
 assert.equal(a.manager.host.size,0);assert.deepEqual(a.game.run.creatures32SeenFloors,before);assert.equal(a.game.hostData.powerUsed,0);a.game.net.on_('gs',()=>{});delete a.game.forge;delete a.game.descentThreat21.allowSpawn;assert.equal(a.game.hostSpawnCreatureIndoor('c32_ram'),true,'own reservation releases after failed native spawn');depth.dispose();
});
await check('stable rejected roll never rerolls with repeated same-floor requests',a=>{
 a.game.config.creatures32=true;a.game.time=30;let n=1;while(n<100&&a.api.choice()){a.game.run.day=++n;a.game.run.descent21.token=`hamsi:1235:${n}`;}assert.equal(a.api.choice(),null);for(let i=0;i<20;i++)assert.equal(a.game.hostSpawnCreatureIndoor('c32_ram'),false);assert.equal(a.manager.host.size,0);assert.equal(a.game.run.creatures32SeenFloors.length,0);
});
await check('real generated ordinary door animation cancels dormant swipe',async a=>{
 // Same CSS-only module loader as the existing native darkcollapse20 harness.
 register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
 Object.assign(globalThis.document,{head:{appendChild(){}},body:{appendChild(){}},documentElement:{},getElementById:()=>null,querySelector:()=>null,addEventListener(){}});
 globalThis.window.addEventListener=globalThis.window.removeEventListener=()=>{};
 const {Game}=await import('../../src/game/game.js');const F=a.game.world.facility,L=F.layout;let door,creaturePos,playerPos,axis;
 a.game.doorById=id=>F.doors.find(d=>d.id===id);a.game.hostSetDoor=hostMethods.hostSetDoor;a.game.net.on_('door',d=>Game.prototype.onDoor.call(a.game,d));
 for(const d of F.doors){if(d.kind!=='door'||d.pos.distanceTo(F.mainDoor.pos)<16)continue;
  a.game.hostSetDoor(d.id,true,true);Game.prototype.updateDoors.call(a.game,.4);a.physics.step(1/60);
  const candidateAxis=d.info.dir===0?{x:1,y:0,z:0}:{x:0,y:0,z:1};const c=d.pos.clone().addScaledVector(candidateAxis,-.9),p=d.pos.clone().addScaledVector(candidateAxis,.9);
  if(F.nav.walkableAt(c.x,c.z)&&F.nav.walkableAt(p.x,p.z)&&a.physics.lineOfSight(c.clone().add({x:0,y:1.2,z:0}),p.clone().add({x:0,y:1.62,z:0}))){door=d;creaturePos=c;playerPos=p;axis=candidateAxis;break;}
 }
 assert(door,'fixture has a genuine ordinary generated door and exposed endpoints');a.setupPlayer(playerPos);a.local.yaw=Math.atan2(axis.x,axis.z);a.player.look.copy(a.local.forward());a.player.flash=true;
 const c=CreatureManager.prototype.hostSpawn.call(a.manager,'c32_dormant',creaturePos,{zone:'in',level:1,elite:false,variant:null,affix:null,tier:null,yaw:Math.atan2(axis.x,axis.z)});wait(a,c,'windup');assert.equal(a.hits.length,0);assert.equal(door.collider,null);
 a.game.hostSetDoor(door.id,false,true);for(let i=0;i<65;i++){Game.prototype.updateDoors.call(a.game,1/60);a.step();}assert(door.collider,'native closing animation builds the real DOOR collider');assert.equal(c.state,'rest');assert.equal(a.hits.length,0);
});
console.log('creatures32 native focused scenarios complete');
