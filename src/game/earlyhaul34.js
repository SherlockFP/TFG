// One existing surface valuable becomes a physical early haul; native cargo owns it.
import {RNG,hashString} from '../core/rng.js';
import {WorldItem} from '../entities/items.js';
import {ITEMS} from './items.js';
import {MOONS} from './moons.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {descentToken} from './descent21_state.js';
import {NavGrid} from '../world/nav.js';

export const EARLY_HAUL34=Object.freeze({type:'indexedglass27',maxSites:18,maxNodes:1024,maxProbes:12000,maxRoute:40});
const Q={x:0,y:0,z:0,w:1},DIRS=[[1,0],[0,1],[-1,0],[0,-1]],MASK=groups(0xffff,G.STATIC|G.DOOR);
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const ordinary=d=>d?.kind==='door'&&!d.locked&&!d.code&&!d.info?.code;
const freeze=p=>{for(const v of Object.values(p))if(v&&typeof v==='object')freeze(v);return Object.freeze(p);};

// The registered model uses the very same centering/bounds path as WorldItem.
// The off-scene probe owns only cloned geometry: no body, world ID or economy draw.
function glassSize(game){
 if(ITEMS[EARLY_HAUL34.type]?.kind!=='big'||!window.__kefalMods?.itemModels?.has(EARLY_HAUL34.type))return null;
 const probe={mgr:game.items,type:EARLY_HAUL34.type,id:'early34-bounds',removeBody(){}};
 try{probe.obj=WorldItem.prototype.makeVisual.call(probe);const s=probe.obj.userData.size;return [s.x,s.y,s.z].every(v=>Number.isFinite(v)&&v>.01)?[s.x,s.y,s.z]:null;}
 finally{if(probe.obj)WorldItem.prototype.dispose.call(probe);}
}

function planHaul(game,bigSpots,bigN,stats){
 const F=game.world.facility,L=F.layout,P=game.physics,source=F.mainDoor?.spawn,size=glassSize(game);
 if(!F.nav||!source||!size)return null;
 // Half-metre native sub-cells represent the center of narrow openable doors.
 // Preserve native dynamic blocked edges; real collider tests reject furniture.
 const N=new NavGrid(L,.5);N.blockedEdges=new Set(F.nav.blockedEdges);
 const doorPoints=(F.doors||[]).filter(ordinary);
 const worldPoint=(gx,gz)=>{const p=N.toWorld(gx,gz);for(const d of doorPoints){if(d.info?.dir===1&&Math.abs(p.z-d.pos.z)<1.5&&Math.abs(p.x-d.pos.x)<.5)p.x=d.pos.x;else if(d.info?.dir===0&&Math.abs(p.x-d.pos.x)<1.5&&Math.abs(p.z-d.pos.z)<.5)p.z=d.pos.z;}return p;};
 const floor=L.y,half=size.map(v=>Math.max(.05,v/2)),height=half[1]+.075;
 const stand=new RAPIER.Capsule(.56,.36),glass=new RAPIER.Cuboid(half[0]+.03,half[1],half[2]+.03);
 // This square encloses every yaw of the real cuboid, proving clearance at turns.
 const radius=Math.hypot(half[0]+.03,half[2]+.03),turn=new RAPIER.Cuboid(radius,half[1],radius);
 const usable=col=>{const d=P.infoOf(col)?.door;return !d||!ordinary(d);};
 const occupied=bigSpots.slice(1,bigN);
 const probe=()=>{if(stats.probes>=EARLY_HAUL34.maxProbes)return false;stats.probes++;return true;};
 const ground=p=>probe()&&(()=>{const h=P.raycast({x:p.x,y:floor+.3,z:p.z},{x:0,y:-1,z:0},.6,G.STATIC);return h&&h.normal.y>.8&&Math.abs(h.point.y-floor)<.045;})();
 const clear=(p,shape,yaw=0,openable=true)=>{if(!probe())return false;let blocked=false;P.world.intersectionsWithShape(p,{x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},shape,()=>{blocked=true;return false;},undefined,MASK,undefined,undefined,openable?usable:undefined);return !blocked;};
 const safe=p=>!occupied.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<radius+1.2)&&ground(p)&&clear({x:p.x,y:floor+.94,z:p.z},stand)&&clear({x:p.x,y:floor+height,z:p.z},turn);
 const sweep=(a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)return true;
  const velocity={x:dx,y:0,z:dz},yaw=Math.atan2(dx,dz),q={x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)};
  if(!probe()||P.world.castShape({x:a.x,y:floor+.94,z:a.z},Q,velocity,stand,.01,1,true,undefined,MASK,undefined,undefined,usable))return false;
  if(!probe()||P.world.castShape({x:a.x,y:floor+height,z:a.z},q,velocity,glass,.01,1,true,undefined,MASK,undefined,undefined,usable))return false;
  for(let i=1,n=Math.ceil(len/.25);i<n;i++)if(!ground({x:a.x+dx*i/n,z:a.z+dz*i/n}))return false;
  return true;
 };
 const src={x:source.x,y:floor,z:source.z},start=N.toGrid(src.x,src.z);
 if(!N.isWalkable(...start)||!safe(src)){stats.sourceRejected=true;return null;}
 const first=worldPoint(...start);if(!safe(first)||!sweep(src,first)){stats.sourceRejected=true;return null;}
 const forbidden=new Set((F.doors||[]).filter(d=>!ordinary(d)&&!d.teleport).map(d=>d.info?.key));
 const initial=start[1]*N.w+start[0],parents=new Map([[initial,-1]]),distance=new Map([[initial,Math.hypot(first.x-src.x,first.z-src.z)]]),tested=new Map([[initial,true]]),queue=[initial];let cursor=0;
 const safeId=id=>{if(tested.has(id))return tested.get(id);const p=worldPoint(id%N.w,Math.floor(id/N.w)),yes=safe(p);tested.set(id,yes);return yes;};
 const route=target=>{
  const g=N.toGrid(target.x,target.z);if(!N.isWalkable(...g))return null;const goal=g[1]*N.w+g[0];
  while(!parents.has(goal)&&cursor<queue.length&&cursor<EARLY_HAUL34.maxNodes&&stats.probes<EARLY_HAUL34.maxProbes){
   const a=queue[cursor++],ax=a%N.w,az=Math.floor(a/N.w),pa=worldPoint(ax,az);stats.nodes=cursor;
   for(const [dx,dz]of DIRS){
    const bx=ax+dx,bz=az+dz,b=bz*N.w+bx;if(!N.inside(bx,bz)||parents.has(b)||!N.canStep(ax,az,bx,bz)||distance.get(a)+N.res>EARLY_HAUL34.maxRoute)continue;
    const cx=Math.floor(ax/N.sub),cz=Math.floor(az/N.sub),nx=Math.floor(bx/N.sub),nz=Math.floor(bz/N.sub);
    if((cx!==nx||cz!==nz)&&forbidden.has(L.edgeKey(cx,cz,dx>0?0:dz>0?1:dx<0?2:3)))continue;
    if(!safeId(b))continue;const pb=worldPoint(bx,bz);if(!sweep(pa,pb))continue;
    parents.set(b,a);distance.set(b,distance.get(a)+Math.hypot(pb.x-pa.x,pb.z-pa.z));queue.push(b);
   }
  }
  if(!parents.has(goal))return null;const last=worldPoint(...g);if(!safe(target)||!sweep(last,target))return null;
  const path=[];for(let i=goal;i!==-1;i=parents.get(i)){const p=worldPoint(i%N.w,Math.floor(i/N.w));path.push([p.x,floor,p.z]);}path.reverse();path.unshift([src.x,floor,src.z]);path.push([target.x,floor,target.z]);
  const length=distance.get(goal)+Math.hypot(last.x-target.x,last.z-target.z);if(length>EARLY_HAUL34.maxRoute)return null;
  const doors=(F.doors||[]).filter(d=>ordinary(d)&&path.some(p=>Math.hypot(p[0]-d.pos.x,p[2]-d.pos.z)<1.25)).map(d=>d.id);
  return {path,doors,length};
 };
 const rng=new RNG(hashString(`${game.run.moon}:${game.run.seed}:${game.run.day}:early-haul34`));
 // Stock big spots sit deep in large rooms. Inspect only native sub-cells in a
 // bounded entrance neighborhood, allowing a side branch before the first room.
 const sites=[],range=Math.ceil(24/N.res);
 for(let gz=Math.max(0,start[1]-range);gz<=Math.min(N.h-1,start[1]+range);gz++)for(let gx=Math.max(0,start[0]-range);gx<=Math.min(N.w-1,start[0]+range);gx++){
  if(!N.isWalkable(gx,gz))continue;const p=N.toWorld(gx,gz),dist=Math.hypot(p.x-src.x,p.z-src.z);if(dist<6||dist>24)continue;
  if(doorPoints.some(d=>Math.hypot(p.x-d.pos.x,p.z-d.pos.z)<2.2))continue;
  const cx=Math.floor(gx/N.sub),cz=Math.floor(gz/N.sub),room=L.roomOf[L.idx(cx,cz)],r=L.rooms[room];
  if(r&&(r.arena||r.sealed||['entrance','entry','vault','containment','core','generator'].includes(r.type)))continue;
  sites.push({x:p.x,z:p.z,room,dist});
 }
 const candidates=rng.shuffle(sites).sort((a,b)=>a.dist-b.dist).slice(0,EARLY_HAUL34.maxSites);
 stats.candidates=candidates.length;
 for(const s of candidates){
  stats.sites++;if(occupied.some(p=>Math.hypot(p.x-s.x,p.z-s.z)<radius+1.2)){stats.occupiedRejected++;continue;}
  const target={x:s.x,y:floor,z:s.z};if(!safe(target)||!clear({x:s.x,y:floor+height,z:s.z},turn,0,false)){stats.siteRejected++;continue;}
  const r=route(target);if(!r||r.length<3){stats.routeRejected++;continue;}
  let approach=r.path[r.path.length-2];for(let i=r.path.length-2;i>=0;i--)if(Math.hypot(r.path[i][0]-s.x,r.path[i][2]-s.z)>=1.25){approach=r.path[i];break;}
  const dx=s.x-approach[0],dy=height-1.5,dz=s.z-approach[2],len=Math.hypot(dx,dy,dz);
  if(len>3.2||!probe()||P.raycast({x:approach[0],y:floor+1.5,z:approach[2]},{x:dx/len,y:dy/len,z:dz/len},len-.05,G.STATIC|G.DOOR)){stats.losRejected++;continue;}
  const yaw=Math.atan2(approach[0]-s.x,approach[2]-s.z);
  return freeze({type:EARLY_HAUL34.type,p:[s.x,floor+height,s.z],yaw,size,approach,path:r.path,doors:r.doors,length:r.length,room:s.room,source:'mainEntrance'});
 }
 return null;
}

export function installEarlyHaul34(game){
 let disposed=false,suspended=false,visit=null,proposal=null,shownPlan=null,diagnostic={};const offs=[];
 const context=()=>{
  const r=game.run,F=game.world?.facility,m=MOONS[r?.moon],d=r?.descent21;
  return !disposed&&!suspended&&game.isHost&&r?.phase==='moon'&&r.quotaIndex===0&&!r.earlyHaul34&&F?.layout?.theme==='factory'&&game.world.moonId===r.moon&&game.world.seed===r.seed&&game.world.descent21Depth===0&&(!d||d.depth===0&&d.token===descentToken(r))&&m&&!['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost','deadletter'].some(k=>m[k])&&!game.deadletter24?.active?.()&&!game.missions14?.active?.()&&!game.escape14?.active?.()&&!game.cycle?.inst?.cur;
 };
 function populationOffer(bigSpots,bigN){
  if(!context()||!Array.isArray(bigSpots)||bigN<1)return null;
  const next={run:game.run,map:game.world.facility,seed:game.run.seed,day:game.run.day};
  if(visit&&visit.run===next.run&&visit.map===next.map&&visit.seed===next.seed&&visit.day===next.day)return proposal;
  visit=next;proposal=null;shownPlan=null;diagnostic={candidates:0,sites:0,nodes:0,probes:0,occupiedRejected:0,siteRejected:0,routeRejected:0,losRejected:0};
  const begin=performance.now();shownPlan=planHaul(game,bigSpots,bigN,diagnostic);diagnostic.ms=performance.now()-begin;
  if(shownPlan)proposal=Object.freeze({type:shownPlan.type,p:shownPlan.p,yaw:shownPlan.yaw});return proposal;
 }
 function consume(offer,id){
  if(!context()||offer!==proposal||!proposal||!finite3(offer.p)||typeof id!=='string'||visit?.run!==game.run||visit?.map!==game.world.facility||visit.seed!==game.run.seed||visit.day!==game.run.day)return false;
  // Close admission BEFORE gs and native item sp both self-deliver synchronously.
  game.run.earlyHaul34=Object.freeze({id,moon:game.run.moon,seed:game.run.seed,day:game.run.day});proposal=null;
  game.broadcastRun?.(['earlyHaul34']);return true;
 }
 const on=(ev,fn)=>{const off=game.mods?.on?.(ev,fn);if(off)offs.push(off);};
 on('sessionEnd',()=>{suspended=true;proposal=null;shownPlan=null;visit=null;});on('sessionStart',()=>{suspended=false;visit=null;});
 on('mapUnloaded',()=>{proposal=null;shownPlan=null;visit=null;});
 return{populationOffer,consume,plan:()=>shownPlan,stats:()=>({...diagnostic}),dispose(){if(disposed)return;disposed=true;proposal=null;shownPlan=null;visit=null;for(const off of offs)off();}};
}
