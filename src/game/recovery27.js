import * as THREE from 'three';
import {RNG,hashString} from '../core/rng.js';
import {t,tf} from '../core/i18n.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {HOST_ONLY} from '../net/session.js';
import {descentToken} from './descent21_state.js';
import {MOONS} from './moons.js';
import {wrapMethod} from './dailyEvents.js';
import {makeRecovery27} from '../models/recovery27.js';
import {RECOVERY27_TEXT as T} from './recovery27_text.js';

HOST_ONLY.add('rc27fx');
export const RECOVERY27=Object.freeze({seconds:4,maxItems:2,minLoose:6,loud:2.2,maxSites:24,maxRouteNodes:12000});
const IDENTITY={x:0,y:0,z:0,w:1},DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
export function recoveryKey27(game){
 const r=game.run,d=r?.descent21,F=game.world?.facility;
 // Calling/cancelling the lift changes descent.nonce on this SAME floor.
 // Only an actual streamed floor changes the cabinet's identity.
 return d?.token===descentToken(r)&&d.depth>0&&F?`${d.token}:${d.depth}:${F.layout.seed}`:'';
}
const loose=it=>it?.state==='world'&&!it.holder&&!it.owner&&!it.inv&&!it.soulbound&&!it.carrier&&!it.nest&&!it.selling&&!it.ladder&&it.type!=='body'&&!/^fj_|^e17_|^cy_|^corecard/.test(it.type)&&it.def?.kind==='scrap'&&!it.def?.special&&!it.def?.keyItem&&!!it.body;
const point=(p,x,y,z)=>{const s=Math.sin(p.yaw),c=Math.cos(p.yaw);return [p.p[0]+x*c+z*s,p.p[1]+y,p.p[2]-x*s+z*c];};
function floorAt(physics,x,y,z){
 const hit=physics.raycast({x,y:y+.3,z},{x:0,y:-1,z:0},.6,G.STATIC|G.DOOR);
 return !!hit&&hit.normal.y>.8&&Math.abs(hit.point.y-y)<.045;
}
function clearShape(physics,pos,shape,mask=G.STATIC|G.DOOR){
 let blocked=false;physics.world.intersectionsWithShape(pos,IDENTITY,shape,()=>{blocked=true;return false;},undefined,groups(G.PLAYER,mask));return !blocked;
}
function clearStanding(physics,p,shape){return floorAt(physics,p[0],p[1],p[2])&&clearShape(physics,{x:p[0],y:p[1]+.94,z:p[2]},shape);}
function clearDrop(physics,it,p){
 if(!it?.size||!floorAt(physics,p[0],p[1]-Math.max(.05,it.size.y/2)-.075,p[2]))return false;
 const shape=new RAPIER.Cuboid(Math.max(.05,it.size.x/2)+.03,Math.max(.05,it.size.y/2),Math.max(.05,it.size.z/2)+.03);
 return clearShape(physics,{x:p[0],y:p[1],z:p[2]},shape);
}

// Route proof uses real standing clearance and walls, excluding locked edges.
// Ordinary closed doors are recorded as native E-openable route steps, never
// treated as an invisible passage. The cabinet adds no geometry collider.
function routeField(game,shape){
 const F=game.world.facility,N=F.nav,L=F.layout,physics=game.physics;
 const source=game.descent21?.plan?.()?.approach||F.mainDoor?.spawn;
 if(!source)return null;
 const start=N.nearestWalkable(...N.toGrid(source.x,source.z),2);
 if(!start)return null;
 const forbidden=new Set((F.doors||[]).filter(d=>d.info&&(d.locked||d.info.code||['vault','contain','blast'].includes(d.info.type))).map(d=>d.info.key));
 const seen=new Map(),tested=new Map(),q=[start[1]*N.w+start[0]];let cursor=0;seen.set(q[0],-1);
 const safe=i=>{if(tested.has(i))return tested.get(i);const p=N.toWorld(i%N.w,Math.floor(i/N.w));const yes=N.walkableAt(p.x,p.z)&&floorAt(physics,p.x,L.y,p.z)&&clearShape(physics,{x:p.x,y:L.y+.94,z:p.z},shape,G.STATIC);tested.set(i,yes);return yes;};
 if(!safe(q[0]))return null;
 const route=target=>{
 const goal=N.toGrid(target[0],target[2]);if(!N.isWalkable(...goal))return null;const goalId=goal[1]*N.w+goal[0];
 // All candidate sites share this single flood and clearance cache. A failed
 // site never restarts up to twelve thousand physics probes on the same map.
 while(!seen.has(goalId)&&cursor<q.length&&cursor<RECOVERY27.maxRouteNodes){
  const a=q[cursor++],ax=a%N.w,az=Math.floor(a/N.w);
  for(const [dx,dz]of DIRS){
   const bx=ax+dx,bz=az+dz,b=bz*N.w+bx;
   if(!N.inside(bx,bz)||seen.has(b)||!N.canStep(ax,az,bx,bz))continue;
   const cx=Math.floor(ax/N.sub),cz=Math.floor(az/N.sub),nx=Math.floor(bx/N.sub),nz=Math.floor(bz/N.sub);
   if((cx!==nx||cz!==nz)&&forbidden.has(L.edgeKey(cx,cz,dx>0?0:dz>0?1:dx<0?2:3)))continue;
   if(!safe(b))continue;
   const pa=N.toWorld(ax,az),pb=N.toWorld(bx,bz),length=Math.hypot(pb.x-pa.x,pb.z-pa.z),vx=(pb.x-pa.x)/length,vz=(pb.z-pa.z)/length;
   let clear=true;for(const side of [-.36,0,.36])for(const height of [.4,1.3])if(physics.raycast({x:pa.x+vz*side,y:L.y+height,z:pa.z-vx*side},{x:vx,y:0,z:vz},length,G.STATIC)){clear=false;break;}
   if(!clear)continue;seen.set(b,a);q.push(b);
  }
 }
 if(!seen.has(goalId))return null;
 const path=[];for(let i=goalId;i!==-1&&path.length<2048;i=seen.get(i)){const p=N.toWorld(i%N.w,Math.floor(i/N.w));path.push({x:p.x,y:L.y,z:p.z});}
 if(path.length>=2048)return null;path.reverse();path.push({x:target[0],y:target[1],z:target[2]});
 // Last partial grid step must retain actual body clearance.
 const a=path[path.length-2],b=path[path.length-1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));
 for(let n=0;n<=steps;n++)if(!clearShape(physics,{x:a.x+(b.x-a.x)*n/steps,y:L.y+.94,z:a.z+(b.z-a.z)*n/steps},shape,G.STATIC))return null;
 const doors=(F.doors||[]).filter(d=>d.kind==='door'&&!d.locked&&d.info&&path.some(p=>Math.hypot(p.x-d.pos.x,p.z-d.pos.z)<1.2)).map(d=>d.id);
 return {path,doors,nodes:cursor};
 };
 route.expanded=()=>cursor;return route;
}

export function planRecovery27(game,diagnostic={}){
 const F=game.world?.facility,L=F?.layout;if(!F?.nav||!L||!game.physics)return null;
 const all=[...(game.items?.all?.()||[])].filter(it=>loose(it)&&F.contains(it.obj.position)&&Math.abs(it.obj.position.y-L.y)<2);
 Object.assign(diagnostic,{loose:all.length,candidates:0,standingRejected:0,losRejected:0,dropRejected:0,routeRejected:0,routeNodes:0});
 if(all.length<RECOVERY27.minLoose)return null;
 const rng=new RNG(hashString(`${recoveryKey27(game)}:cabinet`)),shape=new RAPIER.Capsule(.56,.36),items=rng.shuffle(all.slice());
 const lift=game.descent21?.plan?.(),candidates=[];
 for(const it of items){
  const cx=Math.floor((it.obj.position.x-L.ox)/L.cell),cz=Math.floor((it.obj.position.z-L.oz)/L.cell),roomId=L.roomOf[L.idx(cx,cz)],room=L.rooms[roomId];
  if(!room||room.arena||room.sealed||['entry','vault','containment','core','generator'].includes(room.type)||roomId===lift?.roomId)continue;
  for(const [dx,dz]of rng.shuffle(DIRS.slice())){
   if(L.open.has(L.edgeKey(cx,cz,dx>0?0:dz>0?1:dx<0?2:3)))continue;
   const center={x:L.ox+(cx+.5)*L.cell,z:L.oz+(cz+.5)*L.cell},x=center.x+dx*(L.cell/2-.2),z=center.z+dz*(L.cell/2-.2),yaw=Math.atan2(-dx,-dz);
   if(candidates.some(p=>Math.hypot(p.p[0]-x,p.p[2]-z)<1)||lift&&Math.hypot(lift.x-x,lift.z-z)<5)continue;
   candidates.push({p:[x,L.y,z],yaw,room:roomId});if(candidates.length>=RECOVERY27.maxSites)break;
  }
  if(candidates.length>=RECOVERY27.maxSites)break;
 }
 diagnostic.candidates=candidates.length;const routeFor=routeField(game,shape);if(!routeFor){diagnostic.sourceRejected=true;return null;}
 for(const plan of candidates){
  plan.quiet=point(plan,-.31,.92,.30);plan.noisy=point(plan,.31,.92,.30);plan.approach=point(plan,0,0,1.55);
  if(!clearStanding(game.physics,plan.approach,shape)){diagnostic.standingRejected++;continue;}
  const eye={x:plan.approach[0],y:L.y+1.5,z:plan.approach[2]};
  if([plan.quiet,plan.noisy].some(p=>{const dir=new THREE.Vector3(...p).sub(new THREE.Vector3(eye.x,eye.y,eye.z)),len=dir.length();return game.physics.raycast(eye,dir.normalize(),len-.08,G.STATIC|G.DOOR);})){diagnostic.losRejected++;continue;}
  // Use nearby existing contents; other room loot remains ordinary scavenging.
  const selected=items.filter(it=>Math.hypot(it.obj.position.x-plan.p[0],it.obj.position.z-plan.p[2])<6&&Math.max(it.size.x,it.size.y,it.size.z)<.8).slice(0,RECOVERY27.maxItems);
  if(!selected.length)continue;
  plan.drops=selected.map((it,i)=>point(plan,(i-(selected.length-1)/2)*.7,Math.max(.05,it.size.y/2)+.075,1.08));
  if(plan.drops.some((p,i)=>!clearDrop(game.physics,selected[i],p))){diagnostic.dropRejected++;continue;}
  const route=routeFor(plan.approach);diagnostic.routeNodes=routeFor.expanded();if(!route||route.path.length<5){diagnostic.routeRejected++;continue;}
  plan.path=route.path;plan.doors=route.doors;plan.routeNodes=route.nodes;
  return {plan,ids:selected.map(it=>it.id)};
 }
 return null;
}

export function installRecovery27(game){
 const offs=[];let disposed=false,suspended=false,facility=null,model=null,modelKey='',pending=true,tried=false,settle=0,progressSync=0,fxNet=null,planMs=0,planDiagnostic={};
 const context=()=>{const r=game.run,d=r?.descent21,F=game.world?.facility,m=MOONS[r?.moon];return !disposed&&!suspended&&r?.phase==='moon'&&F&&game.world.moonId===r.moon&&game.world.seed===r.seed&&game.world.descent21Depth===d?.depth&&d?.token===descentToken(r)&&d.depth>=2&&d.depth%2===0&&!['backrooms','nullreception','deadletter'].includes(F.layout.theme)&&m&&!['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost'].some(k=>m[k]);};
 const state=()=>{const st=game.run?.recovery27;return st?.key===recoveryKey27(game)?st:null;};
 const busy=()=>game.deadletter24?.active?.()||game.missions14?.active?.()||game.escape14?.active?.()||game.events11?.active?.()||!!game.cycle?.inst?.cur||[...(game.creatures?.host?.values?.()||[])].some(c=>!c.dead&&c.zone==='in'&&c.def?.boss);
 const publish=()=>game.broadcastRun?.(['recovery27']);
 const epoch=()=>Number(game.net?.hostEpoch)||0;
 const clearModel=()=>{model?.dispose();model=null;modelKey='';};
 function clearOwned(remove=true){
  const st=game.run?.recovery27;if(!game.isHost||!st||st.released||typeof st.custody!=='string'||!st.custody.startsWith('c:recovery27:'))return;
  for(const id of st.ids||[]){const it=game.items?.get?.(id);if(it?.holder!==st.custody)continue;
   if(remove)game.net.broadcast('it',{e:'rm',id});
   else{const row=(st.original||[]).find(r=>r.id===id);if(row&&finite3(row.p))game.net.broadcast('it',{e:'drop',id,p:row.p,q:row.q,lv:[0,0,0]});}
  }
 }
 function rebuildView(){
  const st=state();if(!context()||!st?.plan){clearModel();return;}
  if(modelKey!==st.key||facility!==game.world.facility){clearModel();facility=game.world.facility;model=makeRecovery27(st.plan);facility.group.add(model.root);modelKey=st.key;}
  model.setState(st);
  for(const id of st.ids||[]){const it=game.items?.get?.(id);if(it?.holder===st.custody)it.obj.visible=false;}
 }
 function ensure(){
  if(facility!==game.world?.facility){clearModel();facility=game.world?.facility||null;pending=true;tried=false;settle=0;}
  if(!context())return false;
  const st=state();
  if(game.isHost&&st&&st.epoch!==epoch()){st.epoch=epoch();st.operator=null;st.rev++;st.nonce++;publish();}
  rebuildView();return true;
 }
 function reachable(from,op){
  const st=state(),p=game.aiPlayerById?.(from),anchor=st?.plan?.[op];
  if(!context()||busy()||!anchor||!p||p.dead||p.inShip||p.zone!=='in'||game.downed?.isDowned?.(from)||!p.pos||!p.look||!facility.contains(p.pos)||Math.abs(p.pos.y-st.plan.p[1])>1)return null;
  if([...(game.items?.all?.()||[])].some(it=>it.owner===from||it.holder===from&&!it.inv&&(it.def?.hands===2||it.type==='body')))return null;
  const eye=p.eye||p.pos.clone().add(new THREE.Vector3(0,1.5,0)),v=new THREE.Vector3(...anchor).sub(eye),distance=v.length();
  if(distance>2.7||distance<.05||v.divideScalar(distance).dot(p.look)<.85||game.physics.raycast(eye,v,distance-.08,G.STATIC|G.DOOR))return null;return p;
 }
 function release(st,by,noisy){
  if(st.released||!context()||st.key!==recoveryKey27(game))return false;
  const rows=st.ids.map((id,i)=>({it:game.items.get(id),drop:st.plan.drops[i]}));
  // Nothing is respawned or replenished if another native system removed it.
  if(rows.some(({it,drop})=>!it||it.holder!==st.custody||!finite3(drop)||!clearDrop(game.physics,it,drop))){st.operator=null;st.rev++;st.nonce++;publish();return false;}
  st.released=true;st.operator=null;st.progress=RECOVERY27.seconds;st.rev++;st.nonce++;
  for(const {it,drop}of rows)game.net.broadcast('it',{e:'drop',id:it.id,p:drop,q:it.obj.quaternion.toArray(),lv:[0,0,0]});
  if(noisy){const p=new THREE.Vector3(...st.plan.p);p.y+=1;game.creatures?.noise?.(p,RECOVERY27.loud,by);game.net.broadcast('fx',{k:'snd',s:'hit_metal',p:p.toArray(),v:.8,r:4,m:40});}
  publish();game.net.broadcast('rc27fx',{key:st.key,epoch:st.epoch,rev:st.rev,k:'open'});return true;
 }
 function hostReq(d,from){
  if(!game.isHost||!ensure()||!d)return false;const st=state();
  if(!st||st.released||d.key!==st.key||d.epoch!==st.epoch||d.rev!==st.rev||d.nonce!==st.nonce||!['quiet','noisy'].includes(d.op)||!reachable(from,d.op))return false;
  if(d.op==='noisy')return release(st,from,true);
  if(st.operator)return false;st.operator=from;st.rev++;st.nonce++;progressSync=0;publish();return true;
 }
 const on=(name,fn)=>{const off=game.mods?.on?.(name,fn);if(off)offs.push(off);};
 if(typeof game.unloadMap==='function')offs.push(wrapMethod(game,'unloadMap',old=>function(...args){clearOwned(true);clearModel();suspended=true;pending=false;return old.apply(this,args);}));
 const changed=()=>{clearModel();facility=null;pending=true;tried=false;settle=0;suspended=false;};
 on('registerHandlers',(H,g)=>{if(!g||g===game)H('rc27req',hostReq);});
 on('facilityWillChange',(w,g)=>{if(g&&g!==game)return;suspended=true;clearOwned(true);clearModel();facility=null;pending=false;});
 on('facilityChanged',(w,g)=>{if(!g||g===game)changed();});
 on('mapLoaded',(w,g)=>{if(!g||g===game)changed();});
 on('phase',(ph,g)=>{if(g&&g!==game)return;if(ph!=='moon'){clearOwned(true);clearModel();pending=false;suspended=true;}else changed();});
 on('hostMigrated',(g)=>{if(g&&g!==game)return;if(game.isHost){const st=state();if(st){st.epoch=epoch();st.operator=null;st.rev++;st.nonce++;publish();}}});
 const onFx=d=>{const st=state();if(!context()||!st||d?.key!==st.key||d.epoch!==st.epoch||d.rev!==st.rev||d.k!=='open')return;game.ui?.toast?.(t(T.open),'info');};
 const bind=net=>{if(fxNet===net)return;fxNet?.off?.('msg:rc27fx',onFx);fxNet=net;net?.on?.('msg:rc27fx',onFx);};
 on('netReady',(net,g)=>{if(!g||g===game)bind(net);});if(game.net)bind(game.net);
 on('update',(dt,g)=>{
  if(g&&g!==game||!ensure())return;
  if(game.isHost&&pending&&!tried&&!state()&&!busy()){
   settle+=Math.max(0,Math.min(.25,Number(dt)||0));
   if(settle>=.25){tried=true;pending=false;const started=performance.now();planDiagnostic={};const selected=planRecovery27(game,planDiagnostic);planMs=performance.now()-started;
    if(selected){const key=recoveryKey27(game),custody=`c:recovery27:${key}`,original=game.items.serialize(it=>selected.ids.includes(it.id));
     game.run.recovery27={key,depth:game.run.descent21.depth,seed:facility.layout.seed,epoch:epoch(),rev:1,nonce:1,plan:selected.plan,ids:selected.ids,custody,original,released:false,progress:0,operator:null};
     for(const id of selected.ids)game.net.broadcast('it',{e:'held',id,h:custody,sl:0});publish();rebuildView();
    }
   }
  }
  const st=state();if(!game.isHost||!st?.operator||st.released)return;
  if(!reachable(st.operator,'quiet')){st.operator=null;st.rev++;st.nonce++;publish();return;}
  const elapsed=Math.max(0,Math.min(.25,Number(dt)||0));st.progress=Math.min(RECOVERY27.seconds,st.progress+elapsed);progressSync+=elapsed;
  if(st.progress>=RECOVERY27.seconds)release(st,st.operator,false);
  else if(progressSync>=.25){progressSync=0;publish();}
 });
 on('interactables',(out,g)=>{
  if(g&&g!==game||!ensure()||game.player?.dead||!game.player?.indoor)return;const st=state();if(!st||st.released||busy())return;
  const send=op=>{const current=state();if(current)game.net.request('rc27req',{op,key:current.key,epoch:current.epoch,rev:current.rev,nonce:current.nonce});};
  for(const op of ['quiet','noisy'])out.push({pos:new THREE.Vector3(...st.plan[op]),r:.23,reach:2.5,label:()=>op==='noisy'?t(T.noisy):st.progress>0?tf(st.operator?T.working:T.paused,{n:Math.floor(st.progress/RECOVERY27.seconds*100)}):t(T.quiet),sub:()=>t(T.help),action:()=>send(op)});
 });
 return{state,plan:()=>state()?.plan||null,hostReq,stats:()=>({active:!!context(),planned:!!state(),released:!!state()?.released,held:(state()?.ids||[]).filter(id=>game.items?.get?.(id)?.holder===state()?.custody).length,progress:state()?.progress||0,metrics:model?.metrics||null,planMs,planDiagnostic:{...planDiagnostic}}),dispose(){if(disposed)return;clearOwned(false);disposed=true;clearModel();for(const off of offs)off();fxNet?.off?.('msg:rc27fx',onFx);}};
}
