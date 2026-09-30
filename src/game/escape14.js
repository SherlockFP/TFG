import * as THREE from 'three';
import { registerItem } from './items.js';
import { createItemModel } from '../models/items.js';
import { registerCreature, CREATURES } from './creatures.js';
import { STATE_SOUNDS } from '../entities/creatures.js';
import { PROFILES } from './sfx_profiles.js';
import { IDENT } from './identify.js';
import { FIELD_NOTES } from './collection.js';
import { NO_TELL } from './creature_read.js';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t } from '../core/i18n.js';
import { wrapMethod } from './dailyEvents.js';
import { G } from '../physics/physics.js';
import { bodySegment, bodyRoute, shelterPlacement, shelterPositions, flankRoutes, coverOccluded, addRouteMarks, wardenClear, wardenSegmentClear } from './escape17.js';
import { ID, TUNE as T, mayHide, mayStart, nextPursuit, attackConnects } from './escape14_core.js';
import { TR, RU } from './escape14_text.js';
import { addWardenModel, ensureWardenAudio, wardenModel } from './escape14_view.js';
HOST_ONLY.add('e14state'); HOST_ONLY.add('e14say');
export const LORE='Two clicks, then pursuit. Follow mint floor marks, break sight and stay quiet. Cover buys time; it can see you again.';
export const RECORDING='e14_recording';
registerItem({id:RECORDING,name:'Signal Pursuit Recording',kind:'scrap',value:[85,85],weight:2,hands:1,tier:'common',tip:'A recording of a pursuit the Algorithm failed to finish. Sell it as salvage.'});
let registered=false;
export function registerEscape14(){
 if(registered)return;registered=true;
 registerCreature(ID,{name:'Signal Warden',deathText:'was caught by the Signal Warden.',hp:240,dmg:24,walk:2.4,run:T.speed,power:3,xp:160,coin:25,zone:'in',height:2.35,radius:.55,maxAlive:1,noSpawn:true,lore:LORE},wardenAI);
 PROFILES[ID]={voice:'secbot',foot:'metal',pitch:.7,vol:.5,idle:[0,0],range:[3,40],stride:1.7,keep:['alert','attack','death']};
 STATE_SOUNDS[ID]={warning:['e14_warn',.8,1],windup:['e14_prime',.65,1],search:['e14_search',.5,1],strike:['e14_hit',.7,1],dead:['hit_metal',.6,1]};
 IDENT[ID]=['Pursuer',3,LORE];FIELD_NOTES[ID]=LORE;NO_TELL.add(ID);
}
const moveA=new THREE.Vector3(),moveB=new THREE.Vector3();
function moveSafely(c,target,dt,speed,M){
 const old=c.data.stepFrom;old.copy(c.pos);M.moveToward(c,target,Math.min(dt,.1),speed);
 const dx=c.pos.x-old.x,dz=c.pos.z-old.z,length=Math.hypot(dx,dz);if(length<1e-6)return;
 if(!wardenSegmentClear(M.game,old,c.pos)){c.pos.copy(old);c.path=null;c.repath=Math.max(c.repath||0,.8);return;}
 const radius=(c.def.radius||.55)*.95;
 for(const h of [.7,1.7])for(const offset of [-radius,0,radius]){
  moveA.copy(old);moveA.y+=h;moveB.copy(c.pos);moveB.y+=h;
  moveA.x+=dz/length*offset;moveA.z-=dx/length*offset;moveB.x+=dz/length*offset;moveB.z-=dx/length*offset;
  if(!M.game.physics.lineOfSight(moveA,moveB,G.STATIC|G.DOOR)){c.pos.copy(old);c.path=null;c.repath=Math.max(c.repath||0,.8);return;}
 }
}
// One activation-time scan, not a per-frame search. LOS and real nav exclude deep, disconnected starts.
export function pursuitSpawn(game,p,all,accept=null){
 const fac=game.world.facility,nav=fac?.nav;if(!nav?.findPath)return null;
 const candidate=new THREE.Vector3(),head=new THREE.Vector3(),side=new THREE.Vector3(),dir=new THREE.Vector3(0,-1,0);
 for(const radius of [12,10,8,16])for(let i=0;i<24;i++){
   const angle=i*Math.PI/12;candidate.set(p.pos.x+Math.cos(angle)*radius,p.pos.y,p.pos.z+Math.sin(angle)*radius);
   if(!nav.walkableAt(candidate.x,candidate.z)||all.some(q=>candidate.distanceTo(q.pos)<7)||game.creatures.nearSafeZone({zone:'in',pos:candidate}))continue;
   const floor=game.physics.raycast(head.copy(candidate).add(new THREE.Vector3(0,2.1,0)),dir,2.4,G.STATIC|G.DOOR);
   if(!floor||floor.normal.y<.65||Math.abs(floor.point.y-p.pos.y)>.2)continue;
   if(!game.creatures.canSee({pos:candidate,def:CREATURES[ID],type:ID,zone:'in',yaw:0},p,24,360))continue;
   head.copy(candidate).y+=1.88;if(!game.physics.lineOfSight(head,p.eye||p.pos,G.STATIC|G.DOOR))continue;
   let clear=true;
   for(const h of [.7,1.7])for(const [dx,dz] of [[.65,0],[-.65,0],[0,.65],[0,-.65]]){
     head.copy(candidate).y+=h;side.copy(head);side.x+=dx;side.z+=dz;if(!game.physics.lineOfSight(head,side,G.STATIC|G.DOOR)){clear=false;break;}
   }
   if(!clear)continue;
   if(!wardenClear(game,candidate)||accept&&!accept(candidate))continue;
   const path=nav.findPath(candidate.x,candidate.z,p.pos.x,p.pos.z);if(!path?.length)continue;
   let length=0,x=candidate.x,z=candidate.z;for(const step of path){length+=Math.hypot(step.x-x,step.z-z);x=step.x;z=step.z;}if(length>radius*2.5)continue;
   return candidate.clone();
 }
 return null;
}
export function wardenAI(c,dt,M){
 const g=M.game,api=g.escape14,d=c.data;
 if(!api||g.run?.phase!=='moon')return;
 if(!d.init){d.init=true;d.elapsed=0;d.lost=0;d.last=c.pos.clone();d.stepFrom=c.pos.clone();c.setState('warning');}
 d.elapsed+=dt;if(d.elapsed>=T.attempt){api.finish(c,false);return;}
 if(c.state==='idle'||c.state==='stunned'){api.finish(c,false);c.target=null;c.setState('rest');return;}
 // A boss fight or accepted bonus vault cancels pressure rather than combining two challenges.
 if(api.bossBlocked()){api.finish(c,false);c.target=null;c.setState('rest');return;}
 const all=M.playersFor(c).filter(p=>!p.dead&&!g.downed?.isDowned?.(p.id)&&!p.inShip&&!M.nearSafeZone(p));
 let p=all.find(p=>p.id===c.target),hidden=p&&api.hidden(p.id),visible=p&&!hidden&&M.canSee(c,p,24,360);
 if(c.state==='watch'){
   const n=M.nearest(c,all.filter(p=>!api.hidden(p.id)),22);
   if(!n||!M.canSee(c,n.p,22,360))return;
   c.target=n.p.id;d.last.copy(n.p.pos);d.lost=0;c.setState('warning');return;
 }
 if(c.state==='warning'){
   if(!p){api.finish(c,false);c.setState('rest');return;}
   if(visible)d.last.copy(p.pos);
 }
 if((c.state==='warning'||c.state==='chase'||c.state==='windup')&&visible)d.hadSight=true;
 if(c.state==='chase'){
   d.lost=visible?0:d.lost+dt;if(visible)d.last.copy(p.pos);
   if(p)c.yaw=Math.atan2(p.pos.x-c.pos.x,p.pos.z-c.pos.z);
   // Door-aware navigation and actual LOS: a closed door never grants clairvoyance.
   const goal=visible?p.pos:d.last, gx=goal.x-c.pos.x,gz=goal.z-c.pos.z;
   const door=(g.world.facility?.doors||[]).find(x=>{if(x.kind!=='door'||x.open||x.locked||!x.pos||x.pos.distanceTo(c.pos)>=3)return false;const dx=x.pos.x-c.pos.x,dz=x.pos.z-c.pos.z;return dx*gx+dz*gz>0&&Math.abs(dx*gz-dz*gx)<Math.hypot(gx,gz)*1.2;});
   if(door){if(d.door!==door.id){d.door=door.id;d.doorT=0;}d.doorT+=dt;if(d.doorT>=1.8){g.hostSetDoor?.(door.id,true,true);d.doorT=0;}}
   else if(visible)moveSafely(c,p.pos,dt,T.speed,M);else moveSafely(c,d.last,dt,c.def.walk,M);
 }
 if(c.state==='search'){
   const target=g.aiPlayerById?.(g.run.escape14?.target);
   if(target&&!target.dead&&!g.downed?.isDowned?.(target.id)&&!api.hidden(target.id)&&target.zone===c.zone&&M.canSee(c,target,24,360)){d.validEscape=false;d.lost=0;d.last.copy(target.pos);c.target=target.id;c.setState('chase');return;}
   moveSafely(c,d.last,dt,c.def.walk*.65,M);
   // No attack against someone tucked away. A witnessed alcove is inspected with a grace window.
   if(p&&api.hidden(p.id)&&api.wasSeen(p.id,c.id)&&c.pos.distanceTo(d.last)<3){
     if(!d.inspect){d.inspect=true;api.warn(p.id,'It saw the shelter. It will check in three seconds; prepare to run.');}
     d.inspectT=(d.inspectT||0)+dt;
     if(d.inspectT>=T.inspect){api.eject(p.id,true);api.finish(c,false);c.cooldown=4;c.target=null;c.setState('rest');return;}
   }
 }
 if(c.state==='search'&&c.t>=T.search){
   const alive=g.aiPlayerById?.(g.run.escape14?.target);
   const unseen=alive&&!alive.dead&&!g.downed?.isDowned?.(alive.id)&&(api.hidden(alive.id)||alive.zone!==c.zone||!M.canSee(c,alive,24,360));
   api.finish(c,!!(d.validEscape&&unseen));return;
 }
 const distance=p?p.pos.distanceTo(c.pos):Infinity;
 const next=nextPursuit({state:c.state,t:c.t,visible:!!visible,hidden:!!hidden,distance,lost:!p?T.lost:d.lost});
 if(next){
   if(next==='search'){d.inspect=false;d.inspectT=0;const alive=g.aiPlayerById?.(c.target);d.validEscape=!!(d.hadSight&&alive&&!alive.dead&&!g.downed?.isDowned?.(alive.id)&&(hidden||!visible||d.lost>=T.lost));}
   if(next==='strike'){
     if(p&&attackConnects({visible,hidden,distance,safe:M.nearSafeZone(p),age:c.age})){M.attack(c,p,Math.min(32,c.dmg),ID,true);api.finish(c,false);}
     else { // Windup tolerates 0.7m of retreat; a visible miss must resume the finite pursuit.
       d.lost=0;c.setState('chase');return;
     }
     c.cooldown=4;
   }
   if(next==='rest')c.target=null;
   c.setState(next);
 }
 if(c.state==='strike'&&c.t>=.4){c.target=null;c.setState('rest');}
}

export function installEscape14(game){
 registerEscape14();addTranslations(TR,'tr');addTranslations(RU,'ru');
 const registry=(typeof window!=='undefined'?window.__kefalMods:null)||game.mods;
 addWardenModel(registry?.creatureModels);registry?.itemModels?.set(RECORDING,()=>createItemModel('vhs'));
 const offs=[],bindings=[],restores=[],shelters=[],colliders=[];const requestAt=new Map();let pendingWorld=null,readyFrames=0,buildJobs=null,routeFrames=0,routeJobs=false,plans=[],routeRoot=null,routeKey='';let root=null,mapKey='',clock=0,audioReady=false,localSaved=null,sendClock=0;
 const v=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
 const state=()=>game.run?.escape14;
 const hideBook=()=>state()?.hidden||{};
 const warn=(id,text)=>game.net?.sendTo?.(id,'e14say',{text});
 function publish(){if(game.isHost&&state()){game.net?.broadcast?.('e14state',state());game.broadcastRun?.(['escape14']);}}
 function localSync(){
   const member=hideBook()[game.selfId],p=game.player;if(!p)return;
   if(member&&shelters[member.slot]&&!p.dead&&!p.downed){if(!localSaved)localSaved={frozen:!!p.frozen};p.frozen=true;p.hiding=true;p.crouch=true;p.noise=0;p.sprinting=false;}
   else if(localSaved){p.frozen=localSaved.frozen;p.hiding=false;localSaved=null;}
 }
 function clear(){
   pendingWorld=null;readyFrames=0;buildJobs=null;routeJobs=false;routeFrames=0;plans=[];routeRoot=null;routeKey='';
   if(game.isHost&&state()){state().hidden={};publish();}
   if(localSaved&&game.player){game.player.frozen=localSaved.frozen;game.player.hiding=false;localSaved=null;}
   for(const c of colliders.splice(0))game.physics.removeCollider(c);
   if(root){root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});root=null;}
   shelters.length=0;
 }
 function bossBlocked(){if(game.missions14?.active?.()||game.cycle?.inst?.cur)return true;for(const c of game.creatures?.host?.values?.()||[])if(!c.dead&&(c.def||CREATURES[c.type])?.boss)return true;return false;}
 function build(world){
   clear();const fac=world?.facility,L=fac?.layout;if(!L||(game.run?.quotaIndex|0)<T.quota)return;
   mapKey=`${world.moonId}:${world.seed??L.seed}:${game.run?.day}`;
   if(game.isHost&&state()?.map!==mapKey){game.run.escape14={map:mapKey,used:false,hidden:{},result:'ready'};publish();}
   if(game.isHost&&state()){state().plans=[];delete state().route;publish();}
   root=new THREE.Group();root.name='escape14-screening';game.scene.add(root);
   buildJobs=shelterPositions(L);
 }
 function addShelter(pos){
   const {x,y,z}=pos,shelter={id:shelters.length,pos:pos.clone(),exit:new THREE.Vector3(x,y,z+1.45),hint:new THREE.Vector3(x,y+1,z+.65)};
   shelters.push(shelter);
   const box=(dx,dy,dz,sx,sy,sz,color,solid=true)=>{const geo=new THREE.BoxGeometry(sx,sy,sz),mat=new THREE.MeshLambertMaterial({color,flatShading:true}),m=new THREE.Mesh(geo,mat);m.position.set(x+dx,y+dy,z+dz);root.add(m);if(solid)colliders.push(game.physics.addStaticBox(x+dx,y+dy,z+dz,sx/2,sy/2,sz/2,0,G.STATIC,{kind:'escape14-screen'}));};
   box(-.68,1.12,0,.12,2.24,1.25,0x253d3c);box(.68,1.12,0,.12,2.24,1.25,0x253d3c);box(0,1.12,-.63,1.5,2.24,.12,0x253d3c);box(0,2.28,0,1.5,.12,1.35,0x253d3c);
   box(0,1.8,.65,.7,.12,.06,0x88eed2,false);
   if(shelter.id===0){box(1,1,.68,.35,.4,.15,0x222c30,false);box(1,1,.77,.15,.15,.025,0xffbb66,false);}
 }
 function stepBuild(){
   if(!buildJobs)return;
   const begin=performance.now();let work=0;
   while(work++<3&&performance.now()-begin<1.5){
     const next=buildJobs.next();if(next.done||shelters.length>=3){buildJobs=null;routeJobs=true;routeFrames=0;return;}
     const pos=next.value;
     if(shelters.some(s=>s.pos.distanceTo(pos)<8)||game.creatures.nearSafeZone({zone:'in',pos}))continue;
     if(shelterPlacement(game,pos))addShelter(pos);
   }
 }
 function drawRoute(){
   if(!root)return;
   const route=state()?.map===mapKey&&state()?.plans?.[0],key=route?`${mapKey}:${JSON.stringify(route.points)}`:'';
   if(key===routeKey)return;
   if(routeRoot){routeRoot.removeFromParent();routeRoot.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});routeRoot=null;}
   routeKey=key;if(!route)return;
   routeRoot=new THREE.Group();root.add(routeRoot);addRouteMarks(routeRoot,route.points.map(p=>new THREE.Vector3(...p)));
 }

 function prepareRoute(){
   if(!routeJobs||++routeFrames<2)return;
   if(!game.isHost){routeJobs=false;drawRoute();return;}
   const shelter=shelters[0];if(shelters.length<2||!shelter){routeJobs=false;return;}
   const routes=plans.length?[plans[0].points] : flankRoutes(shelter.pos).filter(points=>bodyRoute(game,points));
   const start=flankRoutes(shelter.pos)[0][0],p={id:'__screening_route',pos:start,eye:start.clone().add(new THREE.Vector3(0,1.62,0)),zone:'in',dead:false,inShip:false,crouch:false};
   const spawn=pursuitSpawn(game,p,[],candidate=>!plans.some(plan=>plan.spawn.distanceTo(candidate)<2)&&routes.some(points=>coverOccluded(game,candidate,points[points.length-1])));
   if(!spawn){routeJobs=false;return;}
   const points=routes.find(points=>coverOccluded(game,spawn,points[points.length-1]));
   plans.push({id:plans.length,shelter:0,console:shelter.hint.clone().add(new THREE.Vector3(1,0,0)),start:start.clone(),spawn,points:points.map(p=>p.clone()),cover:points[points.length-1].clone()});
   state().plans=plans.map(plan=>({...plan,console:plan.console.toArray(),start:plan.start.toArray(),spawn:plan.spawn.toArray(),points:plan.points.map(p=>p.toArray()),cover:plan.cover.toArray()}));publish();if(plans.length===1)drawRoute();if(plans.length>=4)routeJobs=false;
 }

 function eject(id,grace=false){
   if(!game.isHost)return false;
   const entry=hideBook()[id];if(!entry)return false;const shelter=shelters[entry.slot];delete hideBook()[id];
   if(shelter&&game.isHost){game.net.sendTo(id,'tp',{p:shelter.exit.toArray()});if(grace)warn(id,'Shelter ended. Run while the Warden resets.');}
   if(grace)for(const c of game.creatures?.host?.values?.()||[])if(c.type===ID&&!c.dead){c.target=null;c.cooldown=4;c.setState('rest');}
   publish();localSync();return true;
 }
 function enter(from,index){
   const s=shelters[index],p=game.aiPlayerById?.(from);if(!game.isHost||!s||!state()||game.run.phase!=='moon'||!p)return false;
   const reviving=game.downed?.S?.hold&&from===game.selfId||[...game.downed?.S?.book?.e?.values?.()||[]].some(e=>e.by===from);
   const grabbed=game.grab?.owner===from||from===game.selfId&&game.grab?.item;
   const giant=!!grabbed||[...game.items?.all?.()||[]].some(it=>(it.holder===from||it.owner===from)&&(it.def?.kind==='big'||it.def?.hands===2||it.type==='body'));
   const occupied=Object.values(hideBook()).some(e=>e.slot===index);
   const blocked=!game.physics.lineOfSight(p.eye||p.pos,s.hint,G.STATIC|G.DOOR);
   if(!mayHide({alive:!p.dead,distance:p.pos.distanceTo(s.pos),vertical:Math.abs(p.pos.y-s.pos.y),occupied,giant,trolley:game.run.cargo13?.driver===from,reviving:!!reviving,downed:game.downed?.isDowned?.(from),blocked})){warn(from,'Cannot enter: release heavy cargo, trolley or revive; one crewmate per alcove.');return false;}
   const witnessed=[];for(const c of game.creatures?.host?.values?.()||[])if(c.type===ID&&!c.dead&&c.target===from&&game.creatures.canSee?.(c,p,24,360))witnessed.push(c.id);
   hideBook()[from]={slot:index,until:clock+T.hideMax,witnessed};game.net.sendTo(from,'tp',{p:s.pos.toArray()});warn(from,'Stay quiet. Shelter lasts 20 seconds; movement is held. Press E to leave.');publish();localSync();return true;
 }
 function trigger(from=game.selfId){
   if(!game.isHost||!state()||!mayStart({quota:game.run.quotaIndex,used:state().used,boss:bossBlocked(),mission:game.missions14?.active?.(),hides:shelters.length,phase:game.run.phase}))return false;
   const p=game.aiPlayerById?.(from),M=game.creatures;if(!p||p.dead||p.inShip||p.zone!=='in'||game.downed?.isDowned?.(from)||hideBook()[from]||M.nearSafeZone(p))return false;
   const all=game.aiPlayers().filter(q=>!q.dead),fac=game.world.facility;
   const plan=plans.find(plan=>all.every(q=>plan.spawn.distanceTo(q.pos)>=7)&&M.canSee({pos:plan.spawn,def:CREATURES[ID],type:ID,zone:'in',yaw:0},p,24,360)&&coverOccluded(game,plan.spawn,plan.cover)&&bodySegment(game,p.pos,plan.start)&&bodyRoute(game,plan.points));
   const spot=plan?.spawn.clone();
   if(!spot){warn(from,'No clear pursuit route here. Step into an open room and try again.');return false;}
   const c=M.hostSpawn(ID,spot,{zone:'in',state:'warning',level:1,elite:false,affix:null});if(!c)return false;
   c.target=from;state().used=true;state().target=from;state().warden=c.id;state().result='active';state().elapsed=0;state().route=plan.id;game.net.sendTo(from,'e14say',{text:LORE,sound:'e14_warn'});publish();return c.id;
 }
 function finish(c,escaped){
   if(!game.isHost||!state()||state().result!=='active'||state().warden!==c.id)return false;
   if(escaped&&(!c.data.validEscape||c.state!=='search'||c.t<T.search))return false;
   state().result=escaped?'escaped':'failed';game.creatures.hostRemove?.(c.id);warn(state().target,escaped?'Pursuit escaped. Collect the recording at the first shelter.':'Pursuit ended. No recording this time.');publish();return true;
 }
 function claim(from){
   const p=game.aiPlayerById?.(from),s=shelters[0];
   if(!game.isHost||state()?.result!=='escaped'||!p||p.dead||game.downed?.isDowned?.(from)||!s||p.pos.distanceTo(s.hint)>3||!game.physics.lineOfSight(p.eye||p.pos,s.hint,G.STATIC|G.DOOR))return false;
   const id=game.items.hostSpawn?.(RECORDING,s.exit.clone().add(new THREE.Vector3(0,.6,0)),{value:85,baseValue:85,tier:'common'});
   if(!id)return false;state().result='claimed';state().recording=id;publish();return id;
 }
 function request(d,from){if(!d||!game.isHost)return;if(d.op==='leave'){eject(from);return;}if(clock-(requestAt.get(from)??-1)<.25)return;requestAt.set(from,clock);if(d.op==='claim'){claim(from);return;}if(d.op==='enter'&&Number.isInteger(d.slot))enter(from,d.slot);else if(d.op==='start'){
   const p=game.aiPlayerById?.(from),s=shelters[0];if(!p||!s||p.dead||p.pos.distanceTo(s.hint)>3)return;
   if(!trigger(from))warn(from,'Pursuit unavailable: need a clear marked route, quota 2+, and no active boss or bonus mission.');
 }}
 function ready(net){const handlers={e14state:d=>{if(!game.run||!d||typeof d.map!=='string'||typeof d.hidden!=='object')return;game.run.escape14=d;localSync();drawRoute();},e14say:d=>{if(typeof d?.text==='string')game.ui?.toast?.(t(d.text),'info');if(d?.sound==='e14_warn')game.audio?.play?.('e14_warn',{volume:.55});}};for(const[k,h]of Object.entries(handlers)){net.on_(k,h);bindings.push([net,k,h]);}}
 const on=(ev,fn)=>{const off=game.mods?.on?.(ev,fn);if(off)offs.push(off);};
 on('warm',(reg,g)=>{if(g&&g!==game)return;if((game.run?.quotaIndex|0)<T.quota||!game.world?.facility||game.world?.company)return;reg(wardenModel().root);});
 on('netReady',ready);if(game.net)ready(game.net);
 on('registerHandlers',H=>H('e14act',request));on('mapLoaded',world=>{clear();pendingWorld=world;readyFrames=0;});
 if(game.creatures?.openDoorsNear)restores.push(wrapMethod(game.creatures,'openDoorsNear',old=>function(c,...args){if(c.type!==ID)return old.call(this,c,...args);}));
 restores.push(wrapMethod(game,'unloadMap',old=>function(...args){clear();return old.apply(this,args);}));
 on('phase',ph=>{if(ph!=='moon'&&ph!=='landing')clear();});
 on('interactables',out=>{
   if(game.run?.phase!=='moon'||(game.run.quotaIndex|0)<T.quota||!shelters.length)return;
   if(hideBook()[game.selfId]){const p=game.player;out.unshift({pos:p.eyePos().addScaledVector(p.forward(),.6),r:1,reach:2,noLos:true,label:t('Leave alcove [E]'),action:()=>game.net.request('e14act',{op:'leave'})});return;}
   for(const s of shelters)out.push({pos:s.hint,r:.7,reach:2.5,label:t('Enter screening alcove [E]'),action:()=>game.net.request('e14act',{op:'enter',slot:s.id})});
   if(state()?.result==='escaped')out.push({pos:shelters[0].hint.clone().add(new THREE.Vector3(1,0,0)),r:.45,reach:2.5,label:t('Collect pursuit recording [E]'),action:()=>game.net.request('e14act',{op:'claim'})});
   if(state()?.plans?.length&&!state()?.used&&!bossBlocked())out.push({pos:shelters[0].hint.clone().add(new THREE.Vector3(1,0,0)),r:.45,reach:2.5,label:t('Begin optional pursuit [E]'),sub:t(LORE),action:()=>game.net.request('e14act',{op:'start'})});
 });
 on('objectives',(add,g,phase)=>{if(g!==game||phase!=='moon')return;const result=state()?.result;if(result==='active')add(t('Break sight and survive the search. Doors and quiet shelter buy escape.'),'sub');else if(result==='escaped')add(t('Collect pursuit recording [E]'),'sub');});
 on('update',dt=>{
   clock+=dt;localSync();
   if(buildJobs&&Object.keys(hideBook()).length){buildJobs=null;routeJobs=true;routeFrames=0;} // never rebuild occupied shelter
   // Real floor queries need stepped Rapier; final route queries additionally wait for our own panels.
   if(pendingWorld&&game.run?.phase==='moon'&&++readyFrames>=2){const world=pendingWorld;build(world);}
   if(game.run?.phase==='moon'){stepBuild();prepareRoute();}
   if(!audioReady)try{audioReady=ensureWardenAudio(game);}catch{audioReady=true;}
   if(!game.isHost||!state())return;
   if(state().result==='active'){state().elapsed=(state().elapsed||0)+dt;const c=game.creatures.host?.get(state().warden);if(!c||c.dead){state().result='failed';warn(state().target,'Pursuit ended. No recording this time.');publish();}else if(state().elapsed>=T.attempt||c.state==='stunned'||c.stunT>0)finish(c,false);}
   sendClock+=dt;if(sendClock<.2)return;sendClock=0;
   for(const[id,e]of Object.entries(hideBook())){const p=game.aiPlayerById?.(id),s=shelters[e.slot];if(!p||p.dead||!s||p.pos.distanceTo(s.pos)>2.5||game.downed?.isDowned?.(id)){eject(id);continue;}if(clock>=e.until||(p.voice||0)>.25)eject(id,true);}
 });
 on('hostMigrated',()=>{if(game.isHost&&state()){state().hidden={};publish();}});
 return {trigger,enter,eject,finish,claim,hidden:id=>!!hideBook()[id],wasSeen:(id,cid)=>hideBook()[id]?.witnessed?.includes(cid)||false,bossBlocked,active:()=>{for(const c of game.creatures?.host?.values?.()||[])if(c.type===ID&&!c.dead)return true;return false;},routes:()=>structuredClone((state()?.map===mapKey&&state()?.plans||[]).map(p=>({...p,selected:state()?.route===p.id}))),shelters:()=>shelters.map(s=>({id:s.id,p:s.pos.toArray(),exit:s.exit.toArray()})),dispose(){clear();if(localSaved)localSync();for(const off of offs)off();for(const restore of restores.reverse())restore();for(const[net,k,h]of bindings)if(net.msgHandlers?.get(k)===h)net.msgHandlers.delete(k);}};
}
