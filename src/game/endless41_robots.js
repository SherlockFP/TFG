import * as THREE from 'three';
import {G,RAPIER,groups} from '../physics/physics.js';
import {insideShip,SHIP} from '../world/ship.js';
import {isSellable} from './items.js';
import {wrapMethod} from './dailyEvents.js';
import {makeEndless41Robot} from '../models/endless41.js';
import {addTranslations,t} from '../core/i18n.js';
const V=THREE.Vector3,SOLID=G.STATIC|G.DOOR,RADIUS=.46,HALF=.05,HEIGHT=RADIUS+HALF,MAX_ROBOTS=8,MAX_RANK=3;
const holder=id=>`c:e41robot:${id}`,finite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const DEFINITIONS={hauler:{name:'Salvage hauler',description:'Carry one small exterior salvage item through the airlock',price:80},guardian:{name:'Guardian escort',description:'Follow you and strike nearby survival threats',price:100},hauler_upgrade:{name:'Hauler drive upgrade',description:'Improve hauling speed',price:60},guardian_upgrade:{name:'Guardian arm upgrade',description:'Improve attack damage and cooldown',price:80}};
addTranslations({'Salvage hauler':'Hurda taşıyıcısı','Guardian escort':'Muhafız refakatçi','Hauler drive upgrade':'Taşıyıcı motor yükseltmesi','Guardian arm upgrade':'Muhafız kol yükseltmesi','Carry one small exterior salvage item through the airlock':'Dışarıdaki küçük bir hurdayı hava kilidinden geçirir','Follow you and strike nearby survival threats':'Seni izler ve yakındaki hayatta kalma tehditlerine vurur','Improve hauling speed':'Taşıma hızını artır','Improve attack damage and cooldown':'Saldırı gücünü ve hızını artır'},'tr');
addTranslations({'Salvage hauler':'Перевозчик лома','Guardian escort':'Робот охраны','Hauler drive upgrade':'Улучшение привода перевозчика','Guardian arm upgrade':'Улучшение руки охранника','Carry one small exterior salvage item through the airlock':'Переносит один небольшой груз снаружи через шлюз','Follow you and strike nearby survival threats':'Следует за вами и бьёт ближайших противников','Improve hauling speed':'Увеличить скорость перевозки','Improve attack damage and cooldown':'Усилить атаки и сократить перезарядку'},'ru');

export function installEndless41Robots(game){
 let disposed=false,publishT=0,mapKey='',lastPhase=game.run?.phase;const runtime=new Map(),offs=[],restores=[];
 const state=()=>game.run?.endless41;
 const active=()=>!disposed&&game.config?.mode==='endless'&&game.run?.mode==='endless'&&state()?.v===41&&typeof state().token==='string';
 const connected=id=>!!game.net?.players.has(id)&&!game.net.lost?.has(id)&&(id===game.selfId||game.net.transport?.peers?.has(id));
 const player=id=>connected(id)?game.aiPlayerById?.(id):null;
 const publish=()=>{if(active()&&game.isHost)game.broadcastRun?.(['endless41','credits']);};
 const on=(event,fn)=>{const stop=game.mods?.on?.(event,fn);if(stop)offs.push(stop);};
 function floor(x,z,y){
  const terrain=game.world?.terrain?.heightAt?.(x,z),origin=Math.max(y+1.15,Number.isFinite(terrain)?terrain+1.15:-Infinity);
  const h=game.physics.raycast(new V(x,origin,z),new V(0,-1,0),2.3,SOLID);
  return h&&h.normal.y>=.65&&h.point.y-y<=.44&&y-h.point.y<=.65?h.point.y:null;
 }
 function clear(p){let blocked=false;game.physics.world.intersectionsWithShape({x:p[0],y:p[1]+HEIGHT+.03,z:p[2]},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(HALF,RADIUS),()=>{blocked=true;return false;},undefined,groups(0xffff,SOLID));return !blocked;}
 function safe(p){const y=floor(p[0],p[2],p[1]);if(y===null)return null;for(const lift of [0,.3])if(clear([p[0],y+lift,p[2]]))return[p[0],y+lift,p[2]];return null;}
 function dock(){
  for(const [x,z]of [[SHIP.door.x,2.45],[SHIP.door.x,1.9],[SHIP.door.x-.65,1.9],[SHIP.door.x+.65,1.9]]){const p=safe([x,.03,z]);if(p&&insideShip(new V(...p)))return p;}return null;
 }
 function spawn(){const center=dock();if(!center)return null;for(const [dx,dz]of [[0,0],[.6,-.6],[-.6,-.6],[0,-1.2],[1.1,-1.2],[-1.1,-1.2]]){const p=safe([center[0]+dx,center[1],center[2]+dz]);if(p&&insideShip(new V(...p))&&!state().robots.some(r=>r.hp>0&&finite3(r.pos)&&Math.hypot(r.pos[0]-p[0],r.pos[2]-p[2])<1.02))return p;}return null;}
 function gate(from){
  const p=player(from),q=game.endless41?.stationPoint?.()||game.ship?.points?.terminal;
  if(!active()||!game.isHost||state().stage==='over'||!p||p.dead||p.downed||game.downed?.isDowned?.(from)||!q||!insideShip(p.pos)||!['moon','orbit','company'].includes(game.run.phase)||game.endless41?.canPrepare?.(from)===false)return false;
  const eye=p.eye?.isVector3?p.eye:new V(p.pos.x,p.pos.y+1.62,p.pos.z),target=Array.isArray(q)?new V(...q):q,delta=target.clone().sub(eye),distance=delta.length(),ground=game.physics.raycast(new V(p.pos.x,p.pos.y+.2,p.pos.z),new V(0,-1,0),.6,SOLID);
  if(!ground||ground.normal.y<.65||distance>3.5)return false;const hit=distance>.05?game.physics.raycast(eye,delta.normalize(),distance,SOLID):null;return !hit||hit.distance>=distance-.2;
 }
 function catalog(from=game.selfId){return Object.entries(DEFINITIONS).map(([id,d])=>{const kind=id.split('_')[0],r=state()?.robots?.find(r=>r.owner===from&&r.kind===kind&&r.hp>0),upgrade=id.endsWith('_upgrade'),rank=r?.rank||0;return{id,name:t(d.name),description:t(d.description),price:upgrade?d.price+Math.max(0,rank-1)*(kind==='hauler'?40:50):d.price,level:upgrade?rank:rank?1:0,max:upgrade?MAX_RANK:1,available:!upgrade||!!r,kind:'robot'};});}
 function buy(id,from){
  if(!gate(from)||typeof id!=='string'||!Object.hasOwn(DEFINITIONS,id)||!Array.isArray(state().robots)||state().robots.length>MAX_ROBOTS||!Number.isSafeInteger(state().revision)||state().revision<0)return false;
  const s=state(),kind=id.split('_')[0],r=s.robots.find(r=>r.owner===from&&r.kind===kind&&r.hp>0),c=catalog(from).find(c=>c.id===id),upgrade=id.endsWith('_upgrade');
  if(!Number.isFinite(game.run.credits)||game.run.credits<c.price||(upgrade?!(r&&r.rank>=1&&r.rank<MAX_RANK):!!r))return false;
  let pos;if(!upgrade){if(s.robots.filter(r=>r.hp>0).length>=MAX_ROBOTS||!Number.isSafeInteger(s.nextRobot)||s.nextRobot<1)return false;pos=spawn();if(!pos)return false;}
  // Economy and ledger close before synchronous gs callbacks can reenter.
  game.run.credits-=c.price;s.revision++;
  if(upgrade){r.rank++;r.maxHp+=40;r.hp=Math.min(r.maxHp,r.hp+40);}
  else{s.robots=s.robots.filter(r=>r.hp>0);s.robots.push({id:`${s.token}:${s.nextRobot++}`,kind,owner:from,rank:1,pos,yaw:0,mode:'parked',hp:kind==='hauler'?100:120,maxHp:kind==='hauler'?100:120});}
  publish();return true;
 }
 function release(r){
  const id=r.cargoId;if(!id)return;delete r.cargoId;const it=game.items?.get?.(id);r.mode='idle';
  const rt=runtime.get(r.id);if(rt){const b=rt.body.translation();r.pos=[b.x,b.y-HEIGHT-.03,b.z];}
  if(it?.holder===holder(r.id)){const p=[r.pos[0],r.pos[1]+.66,r.pos[2]],q=[0,Math.sin(r.yaw/2),0,Math.cos(r.yaw/2)];game.net.broadcast('it',{e:'drop',id,p,q,lv:[0,0,0]});}
 }
 function cleanup(){for(const rt of runtime.values()){for(const it of game.items?.all?.()||[])if(it.obj.parent===rt.model.carry){game.scene.add(it.obj);it.obj.visible=false;}game.physics.world.removeCharacterController(rt.controller);game.physics.removeBody(rt.body);rt.model.dispose();}runtime.clear();}
 function unload(){if(game.isHost&&active()){for(const r of state().robots)release(r);publish();}cleanup();mapKey='';}
 if(game.unloadMap)restores.push(wrapMethod(game,'unloadMap',old=>function(...args){unload();return old.apply(this,args);}));
 on('sessionEnd',unload);
 function finishDeparture(){if(!active()||!game.isHost)return;for(const r of state().robots){release(r);if(r.hp>0&&!insideShip(new V(...r.pos))){r.hp=0;r.mode='lost';}else r.mode='parked';}publish();}
 on('phase',(phase,g)=>{if(g&&g!==game)return;if(phase==='takeoff')finishDeparture();});
 if(game.hostBeginTakeoff)restores.push(wrapMethod(game,'hostBeginTakeoff',old=>function(...args){const before=game.run?.phase,result=old.apply(this,args);if(before!=='takeoff'&&game.run?.phase==='takeoff')finishDeparture();return result;}));
 function render(r){
  let rt=runtime.get(r.id);if(!rt){const model=makeEndless41Robot(r.kind);model.root.name=`endless41-${r.kind}`;model.root.userData.e41robot=r.id;game.scene.add(model.root);const physical=game.physics.createKinematicCapsule({x:r.pos[0],y:r.pos[1]+HEIGHT+.03,z:r.pos[2]},HALF,RADIUS,G.BIG,SOLID|G.PLAYER|G.REMOTE,{kind:'e41robot',id:r.id}),controller=game.physics.createController(.02);rt={model,...physical,controller,path:null,pathIndex:0,goal:null,planAfter:0,attack:0,stuck:0};runtime.set(r.id,rt);}
  if(game.isHost){const b=rt.body.translation();r.pos=[b.x,b.y-HEIGHT-.03,b.z];}
  else{rt.body.setTranslation({x:r.pos[0],y:r.pos[1]+HEIGHT+.03,z:r.pos[2]},true);rt.body.setNextKinematicTranslation({x:r.pos[0],y:r.pos[1]+HEIGHT+.03,z:r.pos[2]});}
  rt.model.root.position.fromArray(r.pos);rt.model.root.rotation.y=r.yaw;
  const it=r.cargoId&&game.items?.get?.(r.cargoId);if(it?.holder===holder(r.id)){if(it.obj.parent!==rt.model.carry)rt.model.carry.add(it.obj);it.obj.position.set(0,0,0);it.obj.quaternion.identity();it.obj.scale.setScalar(1);it.obj.visible=true;}
  return rt;
 }
 // Bounded A* on real quarter-metre ground/capsule probes. The native controller
 // owns stairs and contact resolution; blocked routes stay put and replan.
 function route(from,to){
  if(Math.hypot(to[0]-from[0],to[2]-from[2])>140)return null;
  const step=.25,goal=[Math.round((to[0]-from[0])/step),Math.round((to[2]-from[2])/step)],key=(x,z)=>`${x},${z}`,nodes=new Map(),open=[],seen=new Set();
  const add=n=>{let i=open.length;open.push(n);while(i>0){const p=(i-1)>>1;if(open[p].f<=n.f)break;open[i]=open[p];i=p;}open[i]=n;};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let c=i*2+1;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(open[c].f>=last.f)break;open[i]=open[c];i=c;}open[i]=last;}return first;};
  const first={x:0,z:0,p:[...from],g:0,f:Math.abs(goal[0])+Math.abs(goal[1]),parent:null};nodes.set(key(0,0),first);add(first);let probes=0;
  while(open.length&&probes++<2048){const a=pop(),k=key(a.x,a.z);if(seen.has(k))continue;seen.add(k);
   if(a.x===goal[0]&&a.z===goal[1]){const end=safe([to[0],a.p[1],to[2]]);if(!end)return null;const path=[end];for(let n=a;n;n=n.parent)path.push(n.p);path.reverse();return path;}
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=a.x+dx,z=a.z+dz,nk=key(x,z);if(seen.has(nk))continue;const prior=nodes.get(nk),g=a.g+1;if(prior&&prior.g<=g)continue;const p=safe([from[0]+x*step,a.p[1],from[2]+z*step]);if(!p)continue;
    let blocked=false;for(const side of [-.4,0,.4])for(const height of [.46,.85]){const start=new V(a.p[0]-dz*side,a.p[1]+height,a.p[2]+dx*side),end=new V(p[0]-dz*side,p[1]+height,p[2]+dx*side);if(!game.physics.lineOfSight(start,end,SOLID))blocked=true;}if(blocked)continue;
    const n={x,z,p,g,f:g+Math.abs(goal[0]-x)+Math.abs(goal[1]-z),parent:a};nodes.set(nk,n);add(n);
   }
  }return null;
 }
 function move(r,rt,target,dt){
  const now=game.time||0;if(!target)return false;
  if(!rt.goal||Math.hypot(target[0]-rt.goal[0],target[2]-rt.goal[2])>1.5||!rt.path){if(now<rt.planAfter)return false;rt.planAfter=now+1;rt.path=route(r.pos,target);rt.pathIndex=1;rt.goal=[...target];if(!rt.path){r.mode='blocked';return false;}}
  while(rt.pathIndex<rt.path.length&&Math.hypot(r.pos[0]-rt.path[rt.pathIndex][0],r.pos[2]-rt.path[rt.pathIndex][2])<.12)rt.pathIndex++;
  if(rt.pathIndex>=rt.path.length){rt.path=null;return true;}const next=rt.path[rt.pathIndex],dx=next[0]-r.pos[0],dz=next[2]-r.pos[2],len=Math.hypot(dx,dz),perks=game.endless41?.build?.(r.owner)?.perks||{},speed=Math.min(5,2.6+(r.rank-1)*.65)*(1+(r.kind==='hauler'?.12*(perks.haul||0):0)),distance=Math.min(len,speed*dt);
  rt.controller.computeColliderMovement(rt.col,{x:dx/len*distance,y:Math.max(-.1,Math.min(.2,next[1]-r.pos[1]))-.04,z:dz/len*distance},undefined,groups(G.BIG,SOLID));const m=rt.controller.computedMovement(),b=rt.body.translation();
  // Vertical depenetration remains meaningful when the horizontal component
  // is stopped by a stair lip. Always apply the native computed movement.
  rt.body.setNextKinematicTranslation({x:b.x+m.x,y:b.y+m.y,z:b.z+m.z});
  if(Math.hypot(m.x,m.z)<.001){rt.stuck+=dt;if(rt.stuck>.6){rt.path=null;rt.stuck=0;r.mode='blocked';}}else{rt.stuck=0;r.yaw=Math.atan2(-m.x,-m.z);}return false;
 }
 function loadable(it){const sz=it?.size;return it&&it.state==='world'&&!it.holder&&!it.owner&&!it.carrier&&!it.soulbound&&!it.selling&&!it.inv&&!it.ladder&&it.type!=='body'&&it.def?.kind==='scrap'&&isSellable(it.def)&&!it.def.special&&sz&&Math.max(sz.x,sz.z)<=.6&&sz.y<=.4&&it.obj.position.y>-40&&!insideShip(it.obj.position);}
 function haul(r,rt,p,dt){
  if(r.cargoId){const it=game.items.get(r.cargoId);if(it?.holder!==holder(r.id)){delete r.cargoId;rt.path=null;}else{r.mode='return';const goal=dock();if(goal){move(r,rt,goal,dt);if(insideShip(new V(...r.pos))&&Math.hypot(r.pos[0]-goal[0],r.pos[2]-goal[2])<.5){release(r);rt.path=null;publish();}}return;}}
  if(game.run.departure38||!p||p.dead||p.pos.y<-40){const goal=dock();r.mode='return';move(r,rt,goal,dt);return;}
  let it=rt.target&&game.items.get(rt.target);if(!loadable(it)){rt.target=null;it=null;}
  if(!it&&(game.time||0)>=(rt.searchAfter||0)){rt.searchAfter=(game.time||0)+1;const list=[...game.items.all()].filter(it=>loadable(it)&&it.obj.position.distanceTo(p.pos)<=22&&!state().robots.some(other=>other!==r&&(other.cargoId===it.id||runtime.get(other.id)?.target===it.id))).sort((a,b)=>a.obj.position.distanceToSquared(new V(...r.pos))-b.obj.position.distanceToSquared(new V(...r.pos))).slice(0,8);
   for(const candidate of list){const target=candidate.obj.position;const path=route(r.pos,[target.x,r.pos[1],target.z]);if(path){it=candidate;rt.target=it.id;rt.path=path;rt.pathIndex=1;rt.goal=[target.x,r.pos[1],target.z];break;}}
  }
  if(it){r.mode='fetch';const target=it.obj.position;move(r,rt,[target.x,r.pos[1],target.z],dt);const eye=new V(r.pos[0],r.pos[1]+.7,r.pos[2]);if(eye.distanceTo(target)<1.3&&game.physics.lineOfSight(eye,target,SOLID)&&loadable(it)){r.cargoId=it.id;r.mode='return';rt.path=null;rt.target=null;publish();game.net.broadcast('it',{e:'held',id:it.id,h:holder(r.id),sl:0});render(r);}return;}
  r.mode='follow';const goal=safe([p.pos.x,p.pos.y,p.pos.z+2]);if(goal&&Math.hypot(r.pos[0]-goal[0],r.pos[2]-goal[2])>2)move(r,rt,goal,dt);
 }
 function guard(r,rt,p,dt){
  rt.attack=Math.max(0,rt.attack-dt);if(game.run.departure38||!p||p.dead||p.pos.y<-40){r.mode='return';move(r,rt,dock(),dt);return;}
  r.mode='guard';if(rt.attack<=0){const start=new V(r.pos[0],r.pos[1]+.8,r.pos[2]),targets=[...(game.creatures?.host?.values?.()||[])].filter(c=>!c.dead&&game.endless41?.ownsCreature?.(c)&&c.pos.distanceTo(start)<=8).sort((a,b)=>a.pos.distanceToSquared(start)-b.pos.distanceToSquared(start));for(const c of targets){const target=c.pos.clone().add(new V(0,.6,0));if(start.distanceTo(target)>8||!game.physics.lineOfSight(start,target,SOLID))continue;rt.attack=Math.max(.8,1.8-(r.rank-1)*.2);const perks=game.endless41?.build?.(r.owner)?.perks||{};game.creatures.damage(c.id,(14+(r.rank-1)*8)*(1+.15*(perks.guardian||0)),r.owner);break;}}
  const goal=safe([p.pos.x+1.5,p.pos.y,p.pos.z+1]);if(goal&&Math.hypot(r.pos[0]-goal[0],r.pos[2]-goal[2])>2)move(r,rt,goal,dt);
 }
 function tick(dt){
  if(!active()||!Number.isFinite(dt)||dt<=0||dt>.25){if(!active())cleanup();return;}const s=state();if(!Array.isArray(s.robots))return;
  const key=`${s.token}:${game.world?.moonId}:${game.world?.seed}`;
  if(mapKey&&mapKey!==key){if(game.isHost)for(const r of s.robots)release(r);cleanup();if(game.isHost)for(const r of s.robots){if(r.hp<=0)continue;const pos=spawn();if(pos){r.pos=pos;r.mode='parked';}else{r.hp=0;r.mode='lost';}}}mapKey=key;
  if(game.run.phase==='takeoff'&&lastPhase!=='takeoff')finishDeparture();lastPhase=game.run.phase;
  if(game.isHost)for(const r of s.robots)if(r.hp<=0&&r.cargoId){release(r);r.mode='lost';publish();}
  const wanted=new Set(s.robots.filter(r=>r.hp>0&&['hauler','guardian'].includes(r.kind)&&finite3(r.pos)).slice(0,MAX_ROBOTS).map(r=>r.id));for(const [id,rt]of runtime)if(!wanted.has(id)){game.physics.world.removeCharacterController(rt.controller);game.physics.removeBody(rt.body);rt.model.dispose();runtime.delete(id);}
  game.physics.world.propagateModifiedBodyPositionsToColliders?.();
  for(const r of s.robots.slice(0,MAX_ROBOTS)){if(!wanted.has(r.id))continue;const rt=render(r);if(!game.isHost||game.run.phase!=='moon'||s.stage==='over')continue;const p=player(r.owner);if(r.kind==='hauler')haul(r,rt,p,dt);else guard(r,rt,p,dt);render(r);}
  publishT+=dt;if(game.isHost&&publishT>=.25&&s.robots.length){publishT=0;publish();}
 }
 return{tick,buy,catalog,dispose(){if(disposed)return;unload();disposed=true;offs.forEach(stop=>stop());restores.reverse().forEach(stop=>stop());}};
}
