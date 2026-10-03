import * as THREE from 'three';
import {hashString} from '../core/rng.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {physicalReach21} from '../world/descent21.js';
import {insideShip} from '../world/ship.js';
import {descentToken} from './descent21_state.js';
import {hasOpenPlaces35} from './openplaces35.js';
import {MOONS} from './moons.js';
import {HOST_ONLY} from '../net/session.js';
import {wrapMethod} from './dailyEvents.js';
import {t} from '../core/i18n.js';
import {buildAdventure40} from '../models/adventure40.js';
import {ADVENTURE_TEXT40,recording40} from './adventure40_text.js';
HOST_ONLY.add('av40fx');
const V=THREE.Vector3,DIRS=[[1,0],[0,1],[-1,0],[0,-1]],SOLID=G.STATIC|G.DOOR;
const freeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')freeze(v);return Object.freeze(o);};
const copy=o=>o?freeze(structuredClone(o)):null;

function context(game){
 const r=game.run,F=game.world?.facility,L=F?.layout,m=MOONS[r?.moon],d=r?.descent21;
 return r?.mode!=='endless'&&r?.phase==='moon'&&r.exploration38===1&&hasOpenPlaces35(r)&&game.world.moonId===r.moon&&game.world.seed===r.seed&&game.world.descent21Depth===0&&L?.seed===r.seed&&L.open35?.version===35&&['courtyard','concourse'].includes(L.open35.kind)&&(!d||d.token===descentToken(r)&&d.depth===0)&&m&&!['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost','deadletter'].some(k=>m[k])&&!game.deadletter24?.active?.()&&!game.missions14?.active?.()&&!game.escape14?.active?.()&&!game.cycle?.inst?.cur?F:null;
}
function certificate(game,approach,target,reach){
 const F=context(game),P=game.physics;if(!F||!reach(approach[0],approach[2]))return false;
 const floor=P.raycast({x:approach[0],y:approach[1]+.3,z:approach[2]},{x:0,y:-1,z:0},.65,SOLID);
 if(!floor||floor.normal.y<.8||Math.abs(floor.point.y-F.layout.y)>.05)return false;
 let blocked=false;P.world.intersectionsWithShape({x:approach[0],y:approach[1]+.94,z:approach[2]},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.56,.36),()=>{blocked=true;return false;},undefined,groups(0xffff,SOLID|G.ITEM|G.BIG));
 if(blocked)return false;
 const eye=new V(approach[0],approach[1]+1.62,approach[2]),delta=new V(...target).sub(eye),len=delta.length();
 return len<2.7&&(len<.1||!P.raycast(eye,delta.normalize(),Math.max(0,len-.1),SOLID));
}
function planScene(game,id){
 const F=context(game),it=game.items?.get?.(id),P=game.physics;if(!F||!it||it.state!=='world'||it.holder||it.owner||it.soulbound||it.def?.kind!=='scrap'||it.def.special||!it.body?.isValid())return null;
 P.world.propagateModifiedBodyPositionsToColliders?.();const L=F.layout,reach=physicalReach21(F,P),target=it.obj.position.toArray();
 // Existing prize stays exactly where the native population put it. Both cargo
 // pickup and recorder need a certified real standing approach on the final map.
 let cargoApproach=null;
 for(let n=0;n<12;n++){const a=n*Math.PI/6,p=[target[0]+Math.cos(a)*1.25,L.y,target[2]+Math.sin(a)*1.25];if(certificate(game,p,target,reach)){cargoApproach=p;break;}}
 if(!cargoApproach)return null;
 const signs=F.group.getObjectByName('openplaces36-landmarks')?.userData.signs,entry=signs?.find(s=>s.role==='entrance');if(!entry)return null;
 const candidates=[];
 const cargoRoom=L.roomOf[F.cellAt(target[0],target[2])];
 for(const id of [...new Set([cargoRoom,...L.open35.bayRooms])]){const r=L.rooms[id];if(!r||r.sealed||r.arena)continue;const sign=signs.find(s=>s.room===id);
  for(let z=r.z;z<r.z+r.h;z++)for(let x=r.x;x<r.x+r.w;x++)for(let d=0;d<4;d++){
   const [dx,dz]=DIRS[d],nx=x+dx,nz=z+dz;if(nx>=r.x&&nx<r.x+r.w&&nz>=r.z&&nz<r.z+r.h||L.open.has(L.edgeKey(x,z,d)))continue;
   const wx=L.ox+(x+.5+dx*.5)*L.cell,wz=L.oz+(z+.5+dz*.5)*L.cell,dist=Math.hypot(wx-target[0],wz-target[2]);if(dist>8)continue;
   candidates.push({wx,wz,nx:-dx,nz:-dz,dist,room:id,title:sign?.title||{en:'CREW 06 RELAY',tr:'EKİP 06 AKTARMA NOKTASI',ru:'РЕТРАНСЛЯТОР БРИГАДЫ 06'}});
  }
 }
 candidates.sort((a,b)=>a.dist-b.dist);let probes=0;
 for(const c of candidates){if(++probes>32)break;
  const mount=[c.wx+c.nx*.11,L.y+1.45,c.wz+c.nz*.11],recording=[c.wx+c.nx*.22,L.y+1.45,c.wz+c.nz*.22],approach=[c.wx+c.nx*1.5,L.y,c.wz+c.nz*1.5];
  const protectedPaths=[game.descent21?.plan?.()?.entryPath||[],game.earlyHaul34?.plan?.()?.path||[]];
  if(protectedPaths.some(path=>path.some(p=>Math.hypot((Array.isArray(p)?p[0]:p.x)-mount[0],(Array.isArray(p)?p[2]:p.z)-mount[2])<1.2)))continue;
  if(!certificate(game,approach,recording,reach))continue;
  // A real wall must back the case; do not float a console across a hidden door.
  const back=P.raycast(new V(...recording),new V(-c.nx,0,-c.nz),.5,SOLID);if(!back||Math.abs(back.point.y-(L.y+1.45))>.01)continue;
  const path=reach.pathTo(approach[0],approach[2])?.map(p=>[p.x,p.y,p.z]);if(!path||path.length>160)continue;
  return {version:40,token:descentToken(game.run),id,variant:hashString(`${descentToken(game.run)}:last-broadcast40`)%3,room:c.room,title:{...c.title},mount,recording,approach,cargoApproach,path,yaw:Math.atan2(c.nx,c.nz),notice:[entry.x, L.y+3.42,entry.z],noticeYaw:Math.atan2(entry.nx,entry.nz),heard:false,returned:false};
 }
 return null;
}

export function installAdventure40(game){
 let disposed=false,suspended=false,pending=null,owned=null,fac=null,bound=null,announced=new Set();const offs=[];
 const state=()=>game.run?.adventure40?.version===40&&game.run.adventure40.token===descentToken(game.run)?game.run.adventure40:null;
 const on=(ev,fn)=>{const off=game.mods?.on?.(ev,fn);if(off)offs.push(off);};
 function clear(){if(owned){game.physics.removeCollider(owned.collider);owned.art.dispose();}owned=null;fac=null;}
 function sync(){
  const F=!disposed&&!suspended&&context(game),s=state();if(!F||!s){clear();return false;}
  if(fac===F&&owned)return true;clear();game.physics.world.propagateModifiedBodyPositionsToColliders?.();
  const reach=physicalReach21(F,game.physics);if(!certificate(game,s.approach,s.recording,reach))return false;
  const collider=game.physics.addStaticBox(...s.mount,.45,.32,.1,s.yaw,G.STATIC,{kind:'static',tag:'adventure40-recorder'});
  game.physics.world.propagateModifiedBodyPositionsToColliders?.();
  const final=physicalReach21(F,game.physics),lift=game.descent21?.plan?.();if(!certificate(game,s.approach,s.recording,final)||!final(s.cargoApproach[0],s.cargoApproach[2])||lift&&!final(lift.approach.x,lift.approach.z)){game.physics.removeCollider(collider);return false;}
  const art=buildAdventure40(s);F.group.add(art.group);owned={collider,art};fac=F;return true;
 }
 function publish(){game.broadcastRun?.(['adventure40']);game.hostSave?.();}
 function effect(d,from){if(disposed||from!==game.net?.hostId&&from!==game.net?.selfId)return;const s=state();if(!s||d?.token!==s.token||d.id!==s.id||!['play','returned'].includes(d.kind))return;
  const key=`${s.token}:${d.kind}`;if(announced.has(key))return;announced.add(key);
  const lines=d.kind==='play'?recording40(s.variant):[t(ADVENTURE_TEXT40.returned)];
  // One non-modal subtitle stays readable; no additional audio/settings owner.
  const show=line=>{if(disposed||suspended||state()?.token!==s.token)return;if(d.kind==='play'&&!context(game))return;game.lore?.say?.(line,{cls:'teach',pri:true,ctx:d.kind==='play'?'facility':'ship',ttl:8});if(!game.lore?.say)game.ui?.hud?.toast?.(line,'info');};
  show(lines[0]);for(let i=1;i<lines.length;i++)game.later?.(()=>show(lines[i]),i*6000);
 }
 function emit(kind){const s=state();if(s)game.net.broadcast('av40fx',{token:s.token,id:s.id,kind});}
 function hostReq(d,from){
  const s=state(),F=context(game),net=game.net;if(disposed||suspended||!game.isHost||!F||!s||s.heard||d?.token!==s.token||d.id!==s.id||!net?.players.has(from)||net.lost?.has(from)||from!==game.selfId&&!net.transport?.peers?.has(from)||!sync())return false;
  const p=game.aiPlayerById?.(from);if(!p||p.dead||p.downed||game.downed?.isDowned?.(from)||p.zone!=='in'||!p.pos||Math.abs(p.pos.y-F.layout.y)>.12)return false;
  const ground=game.physics.raycast(new V(p.pos.x,p.pos.y+.3,p.pos.z),new V(0,-1,0),.65,SOLID);if(!ground||ground.normal.y<.8||Math.abs(ground.point.y-F.layout.y)>.05)return false;
  const height=p.eye?.isVector3?p.eye.y-p.pos.y:Number.isFinite(p.eye)?p.eye:p.crouch?1:1.62;if(height<.8||height>1.8)return false;
  const eye=new V(p.pos.x,p.pos.y+height,p.pos.z),delta=new V(...s.recording).sub(eye),len=delta.length();if(len>=2.7||len>.1&&game.physics.raycast(eye,delta.normalize(),len-.1,SOLID))return false;
  // Reserve before gs/fx synchronously self-deliver and can reenter this handler.
  s.heard=true;publish();emit('play');return true;
 }
 function unbind(){if(bound?.msgHandlers.get('av40fx')===effect)bound.msgHandlers.delete('av40fx');}
 function bind(net){unbind();bound=net;net?.on_?.('av40fx',effect);}
 on('netReady',(net,g)=>{if(!g||g===game)bind(net);});if(game.net)bind(game.net);
 on('registerHandlers',(H,g)=>{if(!g||g===game)H('av40req',hostReq);});
 on('facilityWillChange',(w,g)=>{if(!g||g===game)clear();});
 on('facilityChanged',(w,g)=>{if(!g||g===game)sync();});
 on('sessionEnd',()=>{suspended=true;pending=null;clear();announced.clear();});on('sessionStart',()=>{suspended=false;pending=null;announced.clear();});
 if(game.unloadMap)offs.push(wrapMethod(game,'unloadMap',old=>function(...args){clear();pending=null;return old.apply(this,args);}));
 on('interactables',(out,g)=>{if(g&&g!==game||!sync()||!game.player?.indoor&&!game.player?.zone?.includes('in'))return;const s=state();out.push({pos:new V(...s.recording),r:.38,reach:2.6,label:()=>t(ADVENTURE_TEXT40.play),sub:()=>s.heard?t(ADVENTURE_TEXT40.heard):t(ADVENTURE_TEXT40.notice),action:()=>game.net.request('av40req',{token:s.token,id:s.id})});});
 on('update',(dt,g)=>{
  if(g&&g!==game||disposed||suspended)return;
  if(pending&&game.isHost){const id=pending;pending=null;const plan=planScene(game,id);if(plan){game.run.adventure40=plan;if(sync())publish();else delete game.run.adventure40;}}
  sync();const s=state();if(!game.isHost||!s||s.returned)return;
  const it=game.items?.get?.(s.id);if(!it)return;
  const p=it.holder&&game.aiPlayerById?.(it.holder);
  const aboard=it.state==='world'&&!it.holder&&insideShip(it.obj.position)||p&&!p.dead&&p.inShip&&game.net.players.has(p.id)&&!game.net.lost?.has(p.id)&&(p.id===game.selfId||game.net.transport?.peers?.has(p.id));
  if(aboard){s.returned=true;publish();emit('returned');}
 });
 return {offer(id){if(disposed||suspended||!game.isHost||!context(game)||state()||pending||typeof id!=='string'||!game.items?.get?.(id))return false;pending=id;return true;},scene:()=>owned?copy(state()):null,dispose(){if(disposed)return;disposed=true;pending=null;clear();for(const off of offs)off();unbind();if(game.net?.handlers.get('av40req')===hostReq)game.net.handlers.delete('av40req');}};
}
