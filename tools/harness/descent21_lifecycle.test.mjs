import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const canvas=()=>({width:0,height:0,style:{},remove(){},getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:10}):['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):['getImageData','createImageData'].includes(k)?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):()=>{},set:()=>true})});
globalThis.window=globalThis;globalThis.document={createElement:canvas,documentElement:{},body:{appendChild(){}},head:{appendChild(){}},addEventListener(){},getElementById:()=>null};globalThis.localStorage={getItem:()=>null};globalThis.addEventListener=globalThis.removeEventListener=()=>{};
const THREE=await import('three'),{generateLayout,buildFacility}=await import('../../src/world/facility.js'),{MOONS}=await import('../../src/game/moons.js'),{initPhysics,Physics}=await import('../../src/physics/physics.js');await initPhysics();
const {ItemManager}=await import('../../src/entities/items.js'),{Game}=await import('../../src/game/game.js'),{installDescent21}=await import('../../src/game/descent21.js');
const {chooseSafeFloor}=await import('../../src/game/descent21_state.js'),{buildDescent21}=await import('../../src/world/descent21.js');
const {attentionHot,routineAttentionBusy}=await import('../../src/ui/hud_attention.js');
const {createRpsClient}=await import('../../src/game/arcade_rps_ui.js');
const {installCoop12}=await import('../../src/game/coop12.js');
function fixture(host=true,generation={},deferBootstrap=false){
 const ph=new Physics(),scene=new THREE.Scene(),hooks=new Map(),handlers=new Map(),messages=new Map(),events=[],sent=[];
 const run={phase:'moon',moon:'hamsi',seed:17,day:0,quotaIndex:0,time:123},moon=MOONS.hamsi,F=buildFacility(generateLayout(run.seed,moon.interior,generation.size??moon.size,generation.layoutOpts),{physics:ph,lightPool:{add:e=>e,remove(){}}});scene.add(F.group);if(!deferBootstrap)ph.world.step();
 const player={pos:new THREE.Vector3(0,0,0),dead:false,indoor:false,teleport(p){this.pos.copy(p);this.indoor=p.y<0;}},remote={id:'b',pos:new THREE.Vector3(0,0,0),zone:'out',dead:false};
 const g={isHost:host,selfId:host?'a':'b',run,time:0,world:{moonId:'hamsi',seed:run.seed,facility:F,descent21Depth:0,outdoor:{identity:1}},physics:ph,scene,engine:{scene},env:{},player,lights:{add:e=>e,remove(){}},hostData:{powerUsed:2,powerBoost:1,spawnT:4,outPowerUsed:9,outdoorSpawnT:10,collected:new Set(['paid']),dayStats:{sold:4}},
 mods:{on:(k,fn)=>{const a=hooks.get(k)||[];a.push(fn);hooks.set(k,a);return()=>{hooks.set(k,a.filter(v=>v!==fn));};},emit:(k,...args)=>{events.push([k,...args]);for(const fn of hooks.get(k)||[])fn(...args);}},audio:{play(){},at(){}},ui:{toast(){}},onItemHeld(){},onItemDropped(){},
 net:{selfId:host?'a':'b',hostId:'a',handlers,on_:(k,fn)=>messages.set(k,fn),off:()=>{},sendTo:(id,k,d)=>{sent.push([id,k,d]);if(k==='tp'&&id==='b')remote.pos.fromArray(d.p);},broadcast:(k,d,self=true)=>{sent.push([k,d]);if(self&&k==='it')g.items.onEvent(d);else if(self&&messages.has(k))messages.get(k)(d,'a');}},
 aiPlayers:()=>[{id:g.selfId,pos:player.pos,eye:player.pos.clone().add(new THREE.Vector3(0,1.6,0)),zone:player.indoor?'in':'out',dead:player.dead},...(host?[remote]:[])],aiPlayerById:id=>g.aiPlayers().find(p=>p.id===id),
 doorById:id=>g.world.facility.doors.find(d=>d.id===id),onDoor:Game.prototype.onDoor,broadcastRun(){},creatures:{host:new Map([['outside',{id:'outside',zone:'out',pos:new THREE.Vector3()}],['inside',{id:'inside',zone:'in',pos:new THREE.Vector3(0,-300,0)}]]),views:new Map(),noises:[],hostRemove(id){this.host.delete(id);},onEvent(){}},
 };
 g.items=new ItemManager(g);g.descent21=installDescent21(g);g.descent21.onState();if(!deferBootstrap){ph.world.step();(hooks.get('update')||[]).at(-1)?.(1/60,g);}
 const tick=seconds=>{for(let i=0;i<Math.round(seconds*60);i++){g.time+=1/60;ph.world.step();(hooks.get('update')||[]).at(-1)?.(1/60,g);}};
 const visit=()=>{const L=g.world.facility.layout;for(const id of g.descent21.plan().discoveryRooms){const r=L.rooms[id];player.pos.set(L.ox+(r.cx+.5)*L.cell,L.y+.03,L.oz+(r.cz+.5)*L.cell);player.indoor=true;tick(.3);}};
 const aboard=()=>{const p=g.descent21.plan().spawn;player.teleport(new THREE.Vector3(p.x,p.y+.05,p.z));remote.pos.set(p.x+.55,p.y+.05,p.z);remote.zone='in';};
 const request=op=>{const s=g.descent21.state();return g.descent21.hostReq({op,token:s.token,rev:s.rev,nonce:s.nonce},g.selfId);};
 const dispose=()=>{g.descent21.dispose();g.items.clearAll();g.world.facility.dispose(ph);ph.world.free();};
 return {g,hooks,messages,events,sent,player,remote,tick,visit,aboard,request,dispose};
}
// Unstepped bootstrap read paths must not place a lift against stale Rapier queries.
const Fresh=fixture(true,{},true);let initialQueries=0;
const initialRay=Fresh.g.physics.raycast,initialOverlap=Fresh.g.physics.overlapSphere,initialShapes=Fresh.g.physics.world.intersectionsWithShape;
Fresh.g.physics.raycast=Fresh.g.physics.overlapSphere=Fresh.g.physics.world.intersectionsWithShape=()=>{initialQueries++;throw Error('pre-step placement query');};
Fresh.g.descent21.onState();Fresh.player.indoor=true;Fresh.g.mods.emit('interactables',[],Fresh.g);
assert.equal(initialQueries,0);assert.equal(Fresh.g.descent21.plan(),null,'no pre-step cabin certificate');assert.equal(Fresh.request('call'),false);
Fresh.g.physics.raycast=initialRay;Fresh.g.physics.overlapSphere=initialOverlap;Fresh.g.physics.world.intersectionsWithShape=initialShapes;
Fresh.tick(1/60);assert(Fresh.g.descent21.plan(),'normal native step/update installs checked cabin');
const freshPlan=structuredClone(Fresh.g.descent21.plan()),FreshPeer=fixture(false);assert.deepEqual(FreshPeer.g.descent21.plan(),freshPlan,'same stepped native geometry yields synchronized host/peer certificate');FreshPeer.dispose();Fresh.g.descent21.onState();assert.deepEqual(Fresh.g.descent21.plan(),freshPlan,'read hooks retain checked plan');Fresh.dispose();

// Actual native ordinary lock is not an empty-discovery permanent lift lockout.
const Ring=fixture(true,{size:.68,layoutOpts:{arch:'ring',roomMul:1.05}});Ring.aboard();
assert(Ring.g.descent21.plan().discoveryRooms.length>0);assert.equal(Ring.request('call'),false,'native host rejects structurally eligible but unvisited ring');
const ringL=Ring.g.world.facility.layout,ringDoor=Ring.g.world.facility.doors.find(d=>d.kind==='door'&&d.locked&&[d.info.a,d.info.b].some(i=>i>=0&&ringL.roomOf[i]===0));assert(ringDoor);
Ring.g.onDoor({id:ringDoor.id,locked:false,open:true,silent:true});assert.equal(ringDoor.locked,false,'native unlock remains necessary and effective');Ring.visit();Ring.aboard();assert(Ring.request('call'),'native actual room visitation authorizes call after ordinary unlock');Ring.dispose();
const W=fixture();assert(W.g.descent21.plan(),'actual base factory lift available');
const baseOutdoor=W.g.world.outdoor,baseClock=W.g.run.time,baseRoom=W.g.world.facility.layout.rooms[0],L=W.g.world.facility.layout;
W.g.items.onEvent({e:'sp',id:'surface',ty:'mug',v:40,p:[L.ox+(baseRoom.cx+.5)*L.cell,L.y+.8,L.oz+(baseRoom.cz+.5)*L.cell]});
W.g.items.onEvent({e:'sp',id:'outside',ty:'bolt',v:25,p:[0,1,0]});W.g.items.onEvent({e:'sp',id:'held',ty:'mug',v:35,h:'a',p:[0,0,0]});W.g.items.onEvent({e:'sp',id:'bag',ty:'mug',v:35,h:'a',iv:{k:'bag',x:0,y:0},p:[0,0,0]});
W.aboard();
// Use the native peer invitation producer at the actual generated lift cabin.
W.g.remotes=new Map([['b',W.remote]]);W.g.mods.chatCommands=new Map();W.remote.name='Peer';const rpsRequests=[],rps=createRpsClient({game:W.g,request:(...args)=>rpsRequests.push(args),isHost:()=>true});
assert.equal(W.g.descent21.controlsActive(),true);let prompts=[];rps.interactables(prompts);assert.equal(prompts.length,1);assert.equal(prompts[0].optionalPeer,true,'peer invitation declares central selector policy at actual cabin');
W.g.mods.chatCommands.get('rps').fn(['Peer']);assert.deepEqual(rpsRequests[0],['ch',{to:'b',w:0}],'registered /rps command remains available in cabin');
W.player.pos.copy(new THREE.Vector3(W.g.descent21.plan().approach.x,W.g.descent21.plan().approach.y+.05,W.g.descent21.plan().approach.z));assert.equal(W.g.descent21.controlsActive(),false);prompts=[];rps.interactables(prompts);assert.equal(prompts.length,1,'nearby peer invitation returns immediately outside cabin');
W.aboard();W.player.indoor=false;assert.equal(W.g.descent21.controlsActive(),false);prompts=[];rps.interactables(prompts);assert.equal(prompts.length,1,'cabin coordinates alone never suppress ordinary outdoor invitations');W.player.indoor=true;rps.dispose();
// Installed native high-five producer must also leave physical lift controls
// selectable at the automatic arrival, while remaining available outside it.
const coop=installCoop12(W.g);W.player.yaw=-Math.PI/2;
const socialPrompts=()=>{const out=[];W.g.mods.emit('interactables',out,W.g);return out.filter(it=>it.label().includes('High-five'));};
assert.equal(socialPrompts().length,1);assert.equal(socialPrompts()[0].optionalPeer,true,'native high-five declares central selector policy at actual cabin');
const approach=W.g.descent21.plan().approach;W.player.pos.set(approach.x,approach.y+.05,approach.z);W.remote.pos.copy(W.player.pos).add(new THREE.Vector3(.55,0,0));
assert.equal(W.g.descent21.controlsActive(),false);assert.equal(socialPrompts().length,1,'native high-five returns immediately outside cabin');
W.aboard();W.player.indoor=false;assert.equal(socialPrompts().length,1,'cabin coordinates alone never suppress outdoor high-five');W.player.indoor=true;coop.dispose();
assert.equal(W.request('call'),false,'not unlocked at zero visits');W.visit();
assert.ok(W.g.run.credits>0,'actual host room ticks pay the native run wallet');
const surveyPaid=W.g.run.credits;W.visit();assert.equal(W.g.run.credits,surveyPaid,'repeated actual host visits do not pay twice');W.aboard();
const st=W.g.descent21.state(),forged={op:'call',token:st.token,rev:st.rev,nonce:st.nonce};assert.equal(W.g.descent21.hostReq({...forged,nonce:999},'a'),false,'forged challenge denied');
W.g.events11={active:()=>true};assert.equal(W.request('call'),false,'active native crisis cannot be silently cancelled by transit');W.g.events11=null;
assert(W.request('call'));W.tick(3.1);assert.equal(W.g.descent21.state().liftStage,'ready');
const jammed=W.g.world.facility.doors.find(d=>d.kind==='door'&&!d.locked);assert(jammed);jammed.locked=true;jammed.jam=10;
W.remote.pos.x+=20;assert.equal(W.request('descend'),false,'no forced travel while friend elsewhere');W.aboard();
const cabin=W.g.descent21.plan().spawn;W.g.items.onEvent({e:'sp',id:'corpse',ty:'body',v:5,p:[cabin.x,cabin.y+.5,cabin.z],lb:'Crew'});
assert(W.request('descend'));assert.equal(W.g.descent21.presentationBusy(),true);assert.equal(attentionHot(W.g),false,'lift transit is never fake combat');W.tick(3.1);assert.equal(W.g.descent21.presentationBusy(),true,'native committed floor arrival reserves short local attention');assert.equal(routineAttentionBusy(W.g),true);const atArrival=W.player.pos.clone();W.player.pos.x+=20;assert.equal(W.g.descent21.presentationBusy(),false,'leaving cabin releases routine cues immediately');W.player.pos.copy(atArrival);W.tick(4.1);assert.equal(W.g.descent21.presentationBusy(),false,'safe automatic arrival cannot silence the whole floor');assert.equal(W.g.descent21.state().depth,1,'surface to real first deep floor');
assert.equal(W.g.world.outdoor,baseOutdoor);assert.equal(W.g.run.time,baseClock);assert.equal(W.g.hostData.outPowerUsed,9);assert.equal(W.g.hostData.powerUsed,0);assert.equal(W.g.descent21.clockRate(),0);
assert(W.g.items.get('corpse'));assert(W.g.items.get('held'));assert(W.g.items.get('bag'));assert(W.g.items.get('outside'));assert(!W.g.items.get('surface'));assert(!W.g.creatures.host.has('inside'));assert(W.g.creatures.host.has('outside'));
assert.equal(W.g.items.get('bag').inv.k,'bag','native bag custody kept');assert.equal(W.g.descent21.state().surface.items[0].id,'surface');
const firstIds=new Set([...W.g.items.all()].map(it=>it.id)),firstDeepCount=firstIds.size-4;assert(firstDeepCount<=24&&firstDeepCount>=6,'bounded native deep loot');
const packet=W.sent.find(row=>row[0]==='ds21floor')[1];
// gs-before-floor packet must still relocate crew/cargo exactly once.
const P=fixture(false);P.g.run.descent21=structuredClone(packet.state);P.g.run.descent21.rev+=2;P.g.descent21.onState();P.g.items.onEvent({e:'sp',id:'corpse',ty:'body',v:5,p:[0,-300,0]});P.messages.get('ds21floor')(structuredClone(packet),'a');assert(P.player.indoor);assert(P.g.items.get('corpse'));assert.equal(P.g.world.descent21Depth,1);assert.equal(P.g.descent21.state().rev,packet.state.rev+2,'floor packet preserves newer same-floor room ledger');
const pos=P.player.pos.clone();P.messages.get('ds21floor')(structuredClone(packet),'a');assert(P.player.pos.equals(pos),'duplicate packet idempotent');assert.equal(P.g.descent21.state().depth,1);
P.g.descent21.placeLateJoin();P.player.teleport(new THREE.Vector3(0,0,0));P.tick(.1);assert(P.player.indoor,'late join boards current deep floor after normal physics');
const R=fixture(false);R.messages.get('ds21floor')(structuredClone(packet),'a');const rpos=R.player.pos.clone();R.g.descent21.onState();assert(R.player.pos.equals(rpos),'packet-before-gs does not rebuild or teleport twice');assert(R.g.items.get('corpse'));R.dispose();
W.visit();W.aboard();assert(W.request('call'));W.tick(3.1);assert(W.request('descend'));W.tick(3.1);assert.equal(W.g.descent21.state().depth,2);
assert([...W.g.items.all()].every(it=>!firstIds.has(it.id)||['held','bag','corpse','outside'].includes(it.id)),'abandoned deep loot IDs never return');
W.aboard();const oldSize=MOONS.hamsi.size;MOONS.hamsi.size=1.1;assert(W.request('return'),'express return needs no new discovery');W.tick(3.1);assert.equal(W.g.descent21.state().depth,0);assert.equal(W.g.world.facility.layout.size,oldSize,'return uses actual captured generation despite temporary moon size wrapper');MOONS.hamsi.size=oldSize;assert(W.g.items.get('surface'));assert.equal(W.g.hostData.powerUsed,2,'surface spent budget restored');assert.equal(W.g.descent21.clockRate(),1);assert.equal(W.g.doorById(jammed.id).locked,false,'temporary jam cannot become permanent saved lock');assert(!W.g.doorById(jammed.id).jam);
// Replica sees floor/state ahead of the older native item stream: surface restore
// may still be in transit when the crew has already descended again.
const returnPacket=W.sent.filter(row=>row[0]==='ds21floor').at(-1)[1];
P.messages.get('ds21floor')(structuredClone(returnPacket),'a');
W.g.items.onEvent({e:'sp',id:'left-behind',ty:'comp_coolant',v:11,p:[L.ox+(baseRoom.cx+.5)*L.cell,L.y+.8,L.oz+(baseRoom.cz+.5)*L.cell]});
const lateSurface=W.g.items.serialize(it=>it.id==='left-behind')[0];
// Actual picked-up surface object must not duplicate on a later return.
W.g.items.onEvent({e:'held',id:'surface',h:'a'});W.aboard();assert(W.request('call'));W.tick(3.1);assert(W.request('descend'));W.tick(3.1);assert.equal(W.g.descent21.state().depth,3,'return cannot reroll floors one or two');assert.equal(W.g.descent21.state().surface.items.some(it=>it.id==='surface'),false);
const nextPacket=W.sent.filter(row=>row[0]==='ds21floor').at(-1)[1];
P.g.run.descent21=structuredClone(nextPacket.state);P.g.descent21.onState();
P.messages.get('ds21floor')(structuredClone(nextPacket),'a');
Game.prototype.onItemEvent.call(P.g,{e:'sp',...lateSurface});
assert(!P.g.items.get('left-behind'),'native delayed surface restore cannot recreate sealed surface loot');
// A delayed prior deep spawn is followed by its native ordered removal, even
// if the floor packet overtakes both. No permanent per-floor ID ledger needed.
const oldDeepSpawn=W.sent.find(row=>row[0]==='it'&&row[1].e==='sp'&&!['surface','left-behind'].includes(row[1].id));
assert(oldDeepSpawn);Game.prototype.onItemEvent.call(P.g,structuredClone(oldDeepSpawn[1]));
const retired=W.sent.find(row=>row[0]==='it'&&row[1].e==='rm'&&row[1].id===oldDeepSpawn[1].id);
assert(retired,'host broadcasts native abandoned-floor removal');Game.prototype.onItemEvent.call(P.g,structuredClone(retired[1]));assert(!P.g.items.get(oldDeepSpawn[1].id));
for(const row of W.g.items.serialize(it=>['corpse','surface','bag','outside'].includes(it.id)))Game.prototype.onItemEvent.call(P.g,{e:'sp',...row});
for(const id of ['corpse','surface','bag','outside'])assert(P.g.items.get(id),'native current cargo/held/bag/outdoor snapshot accepted: '+id);
assert(!W.sent.some(row=>row[0]==='it'&&row[1].e==='rm'&&['corpse','held','bag','outside'].includes(row[1].id)),'host removal excludes all carried and outdoor custody');
P.tick(.5);assert(!P.g.items.get('left-behind'),'no delayed surface ghost after normal native frames');P.dispose();
assert.equal(W.g.items.get('surface').holder,'a');assert(W.events.some(([name])=>name==='facilityWillChange'));assert(W.events.some(([name])=>name==='facilityChanged'));assert(!W.events.some(([name])=>name==='mapLoaded'),'outdoor modules never repopulated');
// Staged durations migrate as elapsed simulation, not the previous host's local clock.
const C=fixture();C.visit();C.aboard();assert(C.request('call'));C.tick(1);
const M=fixture(false);M.g.run.descent21=structuredClone(C.g.descent21.state());M.g.isHost=true;M.g.net.hostId='b';M.g.time=10000;M.tick(.1);assert.equal(M.g.descent21.state().liftStage,'calling','new host clock offset cannot instantly complete call');M.tick(2.1);assert.equal(M.g.descent21.state().liftStage,'ready');M.aboard();assert(M.request('descend'));M.tick(1);
const N=fixture(false);N.g.run.descent21=structuredClone(M.g.descent21.state());N.g.isHost=true;N.g.net.hostId='b';N.g.time=20000;N.aboard();N.tick(.1);assert.equal(N.g.descent21.state().depth,0,'travel migration preserves remaining warning');N.tick(2.1);assert.equal(N.g.descent21.state().depth,1,'migrated travel finishes without hanging');
for(const f of [C,M,N])f.dispose();
// A rejected primary uses a bounded deterministic safety choice, physically certified,
// without spawning any loot or changing the logical depth/rule.
let attempts=0;
const fallback=chooseSafeFloor(MOONS.hamsi,17,40,(_,choice)=>{if(++attempts===1)return null;const ph=new Physics();let fac,lift;try{fac=buildFacility(generateLayout(choice.seed,choice.theme,choice.size),{physics:ph,lightPool:{add:e=>e,remove(){}}});ph.world.step();lift=buildDescent21({facility:fac,physics:ph,floor:40});return lift?.plan||null;}finally{lift?.dispose();fac?.dispose(ph);ph.world.free();}});
assert(fallback&&attempts<=3);assert.equal(fallback.choice.theme,'factory');assert.equal(fallback.plan.fingerprint.seed,fallback.choice.seed);
const B=fixture();B.g.descent21.dispose();const layout=B.g.world.facility.layout;
B.g.physics.addStaticBox(0,layout.y+1.4,0,layout.w*layout.cell,2,layout.h*layout.cell);B.g.physics.world.step();let queries=0;const overlap=B.g.physics.overlapSphere.bind(B.g.physics);B.g.physics.overlapSphere=(...args)=>{queries++;return overlap(...args);};B.g.descent21=installDescent21(B.g);B.tick(3);assert.equal(B.g.descent21.plan(),null,'actual physically blocked map has no unsafe lift');const boundedQueries=queries;assert(boundedQueries>0);B.tick(5);assert.equal(queries,boundedQueries,'no-site proof stops retrying after bounded initial attempts');B.dispose();
W.dispose();console.log('descent21 lifecycle: PASS (native Rapier/ItemManager 0→1→2→0→3 custody, timers, cohort, packet race, late join and cleanup)');
