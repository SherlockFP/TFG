// Single streamed facility; native custody, outdoor map and expedition clock stay owned by Game.
import * as THREE from 'three';
import { generateLayout,buildFacility,FACILITY_Y } from '../world/facility.js';
import { Physics,G } from '../physics/physics.js';
import { buildDescent21 } from '../world/descent21.js';
import { MOONS } from './moons.js';
import { scrapTableFor,bigTableFor } from './items.js';
import { RNG } from '../core/rng.js';
import { HOST_ONLY } from '../net/session.js';
import { t,addTranslations,getLang,tf } from '../core/i18n.js';
import { floorSpec } from './descent21_core.js';
import { descentRuleText } from './descent21_text.js';
import { descentToken,newDescent,inCabin,discovered,stageRequest,chooseSafeFloor } from './descent21_state.js';
HOST_ONLY.add('ds21floor');
const TEXT={call:'Call depth lift [E]',descend:'Descend together [E]',back:'Return to surface together [E]',explore:'Explore rooms to authorize the lift.',crew:'All living crew must board; recover downed crew first.',choice:'3s transit. Cabin cargo travels. Deep clock held; abandoned floors seal. Surface clock resumes on return.',busy:'Depth lift travelling. Keep the whole crew aboard.',blocked:'Finish the active pursuit or mission first.',unsafe:'No safe lift on that floor. Transit cancelled.',limit:'Too much loose cargo to preserve safely. Collect it before transit.'};
addTranslations({[TEXT.call]:'Derinlik asansörünü çağır [E]',[TEXT.descend]:'Birlikte aşağı in [E]',[TEXT.back]:'Birlikte yüzeye dön [E]',[TEXT.explore]:'Asansör izni için odaları keşfet.',[TEXT.crew]:'Yaşayan tüm ekip binsin; önce düşen arkadaşını kaldır.',[TEXT.choice]:'3 sn yolculuk. Kabindeki yük taşınır. Terk edilen derin katlar kapanır; yüzey saati dönüşte sürer.',[TEXT.busy]:'Asansör hareket ediyor. Tüm ekip kabinde kalsın.',[TEXT.blocked]:'Önce aktif takibi veya görevi bitir.',[TEXT.unsafe]:'O katta güvenli asansör yok. Yolculuk iptal edildi.',[TEXT.limit]:'Yerdeki yük güvenli kayıt sınırını aşıyor. Önce yükü topla.'},'tr');
addTranslations({[TEXT.call]:'Вызвать глубинный лифт [E]',[TEXT.descend]:'Спуститься вместе [E]',[TEXT.back]:'Вернуться на поверхность вместе [E]',[TEXT.explore]:'Исследуйте комнаты для доступа к лифту.',[TEXT.crew]:'Вся живая команда должна войти; сначала поднимите раненых.',[TEXT.choice]:'Переход 3 с. Груз в кабине едет с вами. Покинутые глубинные этажи закрываются; часы поверхности продолжатся после возврата.',[TEXT.busy]:'Лифт движется. Вся команда должна оставаться внутри.',[TEXT.blocked]:'Сначала завершите погоню или задание.',[TEXT.unsafe]:'На этаже нет безопасного лифта. Переход отменён.',[TEXT.limit]:'Слишком много груза для безопасного сохранения. Сначала соберите его.'},'ru');
addTranslations({'Depth {n} / Tier {tier}':'Derinlik {n} / Kademe {tier}',[TEXT.choice]:'3 sn yolculuk. Kabindeki yük taşınır. Derinde saat durur; terk edilen katlar kapanır. Yüzey saati dönüşte sürer.'},'tr');
addTranslations({'Depth {n} / Tier {tier}':'Глубина {n} / Уровень {tier}',[TEXT.choice]:'Переход 3 с. Груз в кабине едет с вами. В глубине часы стоят; покинутые этажи закрываются. На поверхности часы продолжатся.'},'ru');

export function installDescent21(game){
 let disposed=false,fac=null,lift=null,key='',bound=null,swapping=false,lastVisit=-Infinity,lastLiftAttempt=-Infinity,liftAttempts=0,processed='',announced='',lateJoin=false,stageSincePublish=0;const offs=[];
 const state=()=>game.run?.descent21?.token===descentToken(game.run)?game.run.descent21:null;
 const eligible=run=>{const moon=MOONS[run?.moon];return !!moon&&!['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost'].some(k=>!!moon[k]);};
 const active=()=>!disposed&&!game.destroyed&&eligible(game.run)&&game.run?.phase==='moon'&&game.world?.moonId===game.run.moon&&game.world?.seed===game.run.seed&&!!game.world.facility;
 const spec=run=>{if(!eligible(run)||run?.descent21?.token!==descentToken(run))return null;const st=run.descent21;if(st.depth===0){const gen=st.surface?.gen;return gen?{depth:0,seed:gen.seed,theme:gen.theme,size:gen.size,layoutOpts:gen.lopts||gen.layoutOpts}:null;}const s=floorSpec(MOONS[run.moon],run.seed,st.depth),choice=st.currentChoice;return choice?{...s,seed:choice.seed,theme:choice.theme,size:choice.size}:s;};
 const publish=()=>game.broadcastRun?.(['descent21']);
 const emit=(name,...args)=>game.mods?.emit?.(name,...args);
 const warn=text=>game.ui?.toast?.(t(text),'warn');
 function ensure(){
  if(!active()){if(lift)lift.dispose();lift=null;fac=null;key='';return false;}
  if(game.isHost&&!state()){game.run.descent21=newDescent(game.run);publish();}
  const changed=fac!==game.world.facility||key!==descentToken(game.run);
  if(changed||(!lift&&liftAttempts<4&&game.time-lastLiftAttempt>.5)){
   if(changed)liftAttempts=0;liftAttempts++;
   lift?.dispose();fac=game.world.facility;key=descentToken(game.run);lastLiftAttempt=game.time;lift=buildDescent21({facility:fac,physics:game.physics,floor:state()?.depth||0});
  }
  if(lift&&state())lift.setState({floor:state().depth,discovered:discovered(state(),lift.plan),available:true,busy:['calling','travelling'].includes(state().liftStage)});
  const floor=spec(game.run),notice=floor?.depth>0?`${key}:${floor.depth}`:'';
  if(notice&&notice!==announced){announced=notice;game.ui?.toast?.(`${tf('Depth {n} / Tier {tier}',{n:floor.depth,tier:floor.tier})}. ${descentRuleText(floor.rule,getLang())}`,'info');}
  return !!lift;
 }
 const crew=()=>game.aiPlayers?.().filter(p=>!p.dead)||[];
 const blocked=()=>game.escape14?.active?.()||game.missions14?.active?.()||game.events11?.active?.()||!!game.cycle?.inst?.cur;
 const cohort=()=>crew().length>0&&crew().every(p=>p.zone==='in'&&inCabin(p.pos,lift?.plan)&&!game.downed?.isDowned?.(p.id));
 function reachable(p,op){
  const anchor=lift?.anchors?.[op];if(!anchor||!p||p.dead||p.zone!=='in'||game.downed?.isDowned?.(p.id))return false;
  const a=new THREE.Vector3(anchor.x,anchor.y,anchor.z),from=p.eye||p.pos.clone().add(new THREE.Vector3(0,1.4,0)),dir=a.clone().sub(from),len=dir.length();
  return len<2.6&&(len<.1||!game.physics.raycast(from,dir.normalize(),Math.max(0,len-.18),G.STATIC|G.DOOR));
 }
 function hostReq(d,from){
  if(!game.isHost||!active()||!d||d.token!==descentToken(game.run)||!ensure())return false;const st=state();
  if(d.rev!==st.rev||d.nonce!==st.nonce||!['call','descend','return'].includes(d.op)||!reachable(game.aiPlayerById?.(from),d.op))return false;
  if(blocked()){warn(TEXT.blocked);return false;}if(d.op!=='call'&&!cohort()){warn(TEXT.crew);return false;}
  if(!stageRequest(st,d.op,game.time,discovered(st,lift.plan)))return false;publish();ensure();return true;
 }
 function indoor(it){return it.state==='world'&&!it.holder&&it.obj?.position.y<FACILITY_Y+40;}
 function removeIndoor(keep=new Set()){
  // Native reliable item removals follow any prior spawn on the same stream.
  // A floor packet/state may rebuild a replica before that spawn has arrived.
  for(const it of [...(game.items?.all?.()||[])])if(indoor(it)&&!keep.has(it.id)){
   if(game.isHost)game.net?.broadcast?.('it',{e:'rm',id:it.id},false);
   game.items.onEvent({e:'rm',id:it.id});
  }
  for(const c of [...(game.creatures?.host?.values?.()||[])])if(c.zone==='in'||c.pos?.y<FACILITY_Y+40){game.creatures.hostRemove(c.id);}
  for(const [id,v]of [...(game.creatures?.views?.entries?.()||[])])if(v.zone==='in'||v.pos?.y<FACILITY_Y+40)game.creatures.onEvent({e:'rm',id});
  if(game.creatures?.noises)game.creatures.noises=game.creatures.noises.filter(n=>n.pos.y>=FACILITY_Y+40);
 }
 function floorLayout(run,depth,choice){const moon=MOONS[run.moon],gen=depth===0?run.descent21?.surface?.gen:null,s=depth>0?(run.descent21?.depth===depth?spec(run):floorSpec(moon,run.seed,depth)):gen,c=choice||s;return generateLayout(c?.seed??run.seed,c?.theme??moon.interior,c?.size??moon.size,depth>0?undefined:gen?.lopts||gen?.layoutOpts||moon.layoutOpts||game.facjobs?.layoutOpts?.(moon,run));}
 function preflight(depth,choice){
  const physics=new Physics();let preview=null,lobby=null;
  try{preview=buildFacility(floorLayout(game.run,depth,choice),{physics,lightPool:{add:e=>e,remove(){}}});physics.world.step();lobby=buildDescent21({facility:preview,physics,floor:depth});return lobby?.plan||null;}
  catch(e){console.warn('descent21 floor preflight',e);return false;}
  finally{lobby?.dispose();preview?.dispose(physics);physics.world.free();}
 }
 function chooseFloor(depth){
  return chooseSafeFloor(MOONS[game.run.moon],game.run.seed,depth,preflight);
 }
 function rebuild(depth,verifiedPlan){
  emit('facilityWillChange',game.world,game,depth);lift?.dispose();lift=null;
  game.world.facility?.dispose(game.physics);
  const next=buildFacility(floorLayout(game.run,depth),{physics:game.physics,lightPool:game.lights});
  game.world.facility=next;game.world.descent21Depth=depth;fac=null;key='';game.scene?.add?.(next.group);game.env&&(game.env.interiorFog=next.atmosphere||null);
  fac=next;key=descentToken(game.run);lastLiftAttempt=game.time;liftAttempts=1;lift=buildDescent21({facility:next,physics:game.physics,floor:depth,verifiedPlan});
  if(depth===0&&state()?.surface?.darkcollapse20)game.run.darkcollapse20=structuredClone(state().surface.darkcollapse20);
  next.descent21Generation=depth===0?state()?.surface?.gen:{seed:next.layout.seed,theme:next.layout.theme,size:next.layout.size};
  emit('facilityChanged',game.world,game,depth);return next;
 }
 function onState(){
  if(!active()||swapping)return false;if(!state())return ensure();const st=state();
  if((game.world.descent21Depth||0)!==st.depth){const verifiedPlan=preflight(st.depth);if(!verifiedPlan)return false;swapping=true;try{removeIndoor();rebuild(st.depth,verifiedPlan);}finally{swapping=false;}}
  ensure();return true;
 }
 function applyFloor(d,from){
  if(!active()||!d||d.token!==descentToken(game.run)||d.state?.token!==d.token||!Number.isInteger(d.state.rev))return false;
  const current=state();if(current&&d.state.rev<current.rev&&d.state.depth!==current.depth)return false;
  if(from!==undefined&&from!==game.net?.hostId&&!(game.isHost&&from===game.selfId))return false;
  const receipt=`${d.token}:${d.state.nonce}:${d.state.rev}`;if(receipt===processed)return true;
  if(!current||d.state.rev>=current.rev)game.run.descent21=d.state;const keep=new Set((d.cargo||[]).map(it=>it.id));swapping=true;
  try{if((game.world.descent21Depth||0)!==d.state.depth){removeIndoor(keep);rebuild(d.state.depth,d.plan);}else ensure();
   if(d.state.depth===0){for(const row of d.state.surface?.doors||[])game.onDoor?.(row);}
   for(const [index,row]of (d.cargo||[]).entries()){
    const p=lift.plan.spawn,turn=d.origin?((d.origin.yaw===lift.plan.yaw)?1:-1):1,pos=d.origin?[p.x+(row.p[0]-d.origin.x)*turn,p.y+(row.p[1]-d.origin.y),p.z+(row.p[2]-d.origin.z)*turn]:[p.x+(index%3-1)*.35,p.y+.5,p.z+(Math.floor(index/3)%3-1)*.35];
    if(!game.items.get?.(row.id))game.items.onEvent({e:'sp',...row,p:pos});else game.items.onEvent({e:'tp',id:row.id,p:pos});
   }
   const id=(d.crew||[]).indexOf(game.selfId);if(id>=0){const p=lift.plan.safeSpawns?.[id%4]||lift.plan.spawn;game.player.teleport(new THREE.Vector3(p.x,p.y+.05,p.z),0);game.psTimer=0;}
  }finally{swapping=false;}processed=receipt;ensure();return true;
 }
 function populate(){const s=spec(game.run);if(!s)return;const F=game.world.facility,rng=new RNG(s.seed^0x5eed),spots=rng.shuffle(F.scrapSpots.slice()),table=scrapTableFor(s.theme).map(([id,w])=>({id,w}));
  if(s.rule==='archive')spots.sort((a,b)=>Number(b.room>=0&&b.dist>=5)-Number(a.room>=0&&a.dist>=5));
  const count=Math.min(spots.length,rng.int(s.loot.countMin,s.loot.countMax)),big=s.rule==='heavy'?rng.shuffle(F.bigSpots.slice()).slice(0,Math.min(2,count)):[],bigTable=bigTableFor(s.theme).map(([id,w])=>({id,w}));
  for(let i=0;i<count-big.length;i++){const p=spots[i];game.items.hostSpawn(rng.weighted(table).id,new THREE.Vector3(p.x,p.y+.8,p.z),{valueMul:s.loot.valueMul});}
  for(const p of big)game.items.hostSpawn(rng.weighted(bigTable).id,new THREE.Vector3(p.x,p.y+1,p.z),{valueMul:s.loot.valueMul});
 }
 function commit(){
  const st=state();if(!st||!cohort()||blocked()){if(st){st.liftStage='ready';st.rev++;publish();}return false;}
  if([...game.items.all()].some(it=>indoor(it)&&it.owner&&!inCabin(it.obj.position,lift.plan))){st.liftStage='ready';st.rev++;publish();warn(TEXT.limit);return false;}
  const cargo=game.items.serialize(it=>indoor(it)&&inCabin(it.obj.position,lift.plan));
  const surface=st.depth===0?{gen:structuredClone(fac.descent21Generation||{seed:fac.layout.seed,theme:fac.layout.theme,size:fac.layout.size}),items:game.items.serialize(it=>indoor(it)&&!cargo.some(c=>c.id===it.id)),doors:fac.doors.map(d=>({id:d.id,open:d.open,locked:d.jam?false:d.locked,silent:true})),darkcollapse20:game.run.darkcollapse20?structuredClone(game.run.darkcollapse20):undefined,budget:{powerUsed:game.hostData?.powerUsed||0,powerBoost:game.hostData?.powerBoost||0,spawnT:game.hostData?.spawnT||20}}:st.surface;
  if(cargo.length>64||(surface?.items?.length||0)>256){st.liftStage='ready';st.rev++;publish();warn(TEXT.limit);return false;}
  const next=chooseFloor(st.target);if(!next){st.liftStage='ready';st.rev++;publish();warn(TEXT.unsafe);return false;}const verifiedPlan=next.plan;
  const oldDepth=st.depth;st.surface=surface;if(oldDepth===0)st.surfaceVisited=[...st.visited];st.depth=st.target;st.currentChoice=next.choice;st.reached=Math.max(st.reached,st.depth);st.visited=st.depth===0?[...st.surfaceVisited]:[];st.liftStage='idle';st.stageTime=game.time;st.stageElapsed=0;st.rev++;st.nonce++;delete st.target;
  const packet={token:st.token,state:structuredClone(st),cargo,crew:crew().map(p=>p.id),plan:verifiedPlan,origin:{...lift.plan.spawn,yaw:lift.plan.yaw}};
  game.net?.broadcast?.('ds21floor',packet,false);applyFloor(packet,game.selfId);
  if(game.hostData){Object.assign(game.hostData,st.depth>0?{powerUsed:0,powerBoost:0,spawnT:20}:st.surface?.budget||{powerUsed:0,powerBoost:0,spawnT:20});game.hostData.exitField=null;}
  for(const [i,id]of packet.crew.entries()){if(id===game.selfId)continue;const p=lift.plan.safeSpawns?.[i%4]||lift.plan.spawn;game.net.sendTo(id,'tp',{p:[p.x,p.y+.05,p.z],yaw:0});}
  if(st.depth===0){for(const row of st.surface?.items||[])if(!game.items.get?.(row.id))game.net.broadcast('it',{e:'sp',...row});}
  else populate();publish();return true;
 }
 const on=(name,fn)=>{const off=game.mods?.on?.(name,fn);if(off)offs.push(off);};
 on('registerHandlers',(H,g)=>{if(g===game)H('d21req',hostReq);});
 on('update',(dt,g)=>{if(g&&g!==game)return;if(!ensure()||!state())return;const st=state();
  if(lateJoin&&st.depth>0){lateJoin=false;const p=lift.plan.safeSpawns?.[0]||lift.plan.spawn;game.player.teleport(new THREE.Vector3(p.x,p.y+.05,p.z),0);game.psTimer=0;}
  if(!game.isHost)return;
  if(game.time-lastVisit>=.25){lastVisit=game.time;let changed=false;const L=fac.layout,valid=new Set(lift.plan.discoveryRooms);
   for(const p of crew()){if(p.zone!=='in')continue;const x=Math.floor((p.pos.x-L.ox)/L.cell),z=Math.floor((p.pos.z-L.oz)/L.cell),id=L.roomOf[L.idx(x,z)];if(valid.has(id)&&!st.visited.includes(id)){st.visited.push(id);changed=true;}}
   if(changed){st.rev++;publish();}
  }
  if(['calling','travelling'].includes(st.liftStage)){
   const elapsed=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;st.stageElapsed=(st.stageElapsed||0)+elapsed;stageSincePublish+=elapsed;
   if(st.stageElapsed>=3){if(st.liftStage==='calling'){st.liftStage='ready';st.rev++;publish();ensure();}else commit();stageSincePublish=0;}
   else if(stageSincePublish>=.25){publish();stageSincePublish=0;}
  }
 });
 on('interactables',(out,g)=>{if(g!==game||game.player?.dead||!game.player?.indoor||!ensure()||!state())return;const st=state();
  const request=op=>game.net.request('d21req',{op,token:st.token,rev:state().rev,nonce:state().nonce});
  if(['calling','travelling'].includes(st.liftStage))return;
  const ready=discovered(st,lift.plan);
  out.push({pos:new THREE.Vector3(lift.anchors.call.x,lift.anchors.call.y,lift.anchors.call.z),r:.3,reach:2.4,label:()=>t(TEXT.call),sub:()=>`${st.visited.length}/${Math.min(15,lift.plan.discoveryRooms.length)} ${ready?'':t(TEXT.explore)}`,action:()=>request('call')});
  if(st.liftStage==='ready')out.push({pos:new THREE.Vector3(lift.anchors.descend.x,lift.anchors.descend.y,lift.anchors.descend.z),r:.3,reach:2.4,label:()=>t(TEXT.descend),sub:()=>t(TEXT.choice),action:()=>request('descend')});
  if(st.depth>0)out.push({pos:new THREE.Vector3(lift.anchors.return.x,lift.anchors.return.y,lift.anchors.return.z),r:.3,reach:2.4,label:()=>t(TEXT.back),sub:()=>t(TEXT.choice),action:()=>request('return')});
 });
 const originalDoor=game.doorInteraction;
 if(originalDoor){const replacement=function(door){if(game.player?.indoor&&state()?.depth>0&&['entrance','fireexit'].includes(door.kind))return {pos:door.pos,r:.5,reach:2.5,label:()=>t(TEXT.back),sub:()=>t(TEXT.crew),action:()=>warn(TEXT.back)};return originalDoor.call(this,door);};game.doorInteraction=replacement;offs.push(()=>{if(game.doorInteraction===replacement)game.doorInteraction=originalDoor;});}
 function bind(net){bound?.off?.('msg:ds21floor',applyFloor);bound=net;bound?.on_?.('ds21floor',applyFloor);}on('netReady',(net,g)=>{if(g===game)bind(net);});if(game.net)bind(game.net);
 return {spec,onState,state,hostReq,commit,acceptItemEvent(d){
  // A surface checkpoint contains only loose items left behind, never lift
  // cargo or held/bag custody. It is bounded and replicated with native state.
  const st=state();return !(active()&&st?.depth>0&&d?.e==='sp'&&!d.h&&!d.iv&&
   d.p?.[1]<FACILITY_Y+40&&st.surface?.items?.some(row=>row.id===d.id));
 },controlsActive:()=>!!(active()&&lift&&fac===game.world.facility&&game.player?.indoor&&!game.player.dead&&inCabin(game.player.pos,lift.plan)),placeLateJoin(){lateJoin=true;},plan:()=>lift?.plan||null,clockRate:()=>active()&&(state()?.depth>0||state()?.liftStage==='travelling')?0:1,dispose(){if(disposed)return;disposed=true;lift?.dispose();lift=null;for(const off of offs)off();bound?.off?.('msg:ds21floor',applyFloor);}};
}
