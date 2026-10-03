// One rolled valuable may move into an existing signed optional bay. No new loot.
import {hashString} from '../core/rng.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {physicalReach21} from '../world/descent21.js';
import {hasOpenPlaces35} from './openplaces35.js';
import {descentToken} from './descent21_state.js';
import {MOONS} from './moons.js';

export const SALVAGE39=Object.freeze({minValue:90,maxItems:18,maxSites:24,minDetour:4,maxRoute:120});
const IDENTITY={x:0,y:0,z:0,w:1},DIRS=[[1,0],[0,1],[-1,0],[0,-1]],SOLID=G.STATIC|G.DOOR;
const freeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')freeze(v);return Object.freeze(o);};
const routeLength=path=>path.reduce((sum,p,n)=>n?sum+Math.hypot(p[0]-path[n-1][0],p[2]-path[n-1][2]):0,0);

function context(game){
 const run=game.run,fac=game.world?.facility,L=fac?.layout,moon=MOONS[run?.moon],token=descentToken(run),st=run?.descent21;
 if(!game.isHost||run?.phase!=='moon'||run.exploration38!==1||!hasOpenPlaces35(run)||!fac?.nav||!game.physics?.world||!fac.mainDoor?.spawn||
  game.world.moonId!==run.moon||game.world.seed!==run.seed||L.seed!==run.seed||game.world.descent21Depth!==0||st&&(st.depth!==0||st.token!==token)||
  !moon||['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost','deadletter'].some(k=>moon[k])||
  game.deadletter24?.active?.()||game.missions14?.active?.()||game.escape14?.active?.()||game.cycle?.inst?.cur||run.salvage39?.token===token)return null;
 const landmarks=fac.group.getObjectByName('openplaces36-landmarks');
 if(L.open35?.version!==35||!['courtyard','concourse'].includes(L.open35.kind)||landmarks?.userData.version!==36||landmarks.userData.kind!==L.open35.kind)return null;
 return{run,fac,L,token,landmarks};
}
function plain(it){return it?.state==='world'&&!it.holder&&!it.owner&&!it.carrier&&!it.soulbound&&!it.collected&&it.body?.isValid()&&it.def?.kind==='scrap'&&!it.def.special&&!it.def.fragile&&!it.type.startsWith('fj');}
function deadend(L,fac,id){
 const r=L.rooms[id],neighbors=new Set();if(!r||r.type!=='open35_bay'||r.sealed||r.arena||r.maze)return false;
 if(fac.fireDoors.some(d=>L.roomOf[d.info?.a]===id))return false;
 for(let z=r.z;z<r.z+r.h;z++)for(let x=r.x;x<r.x+r.w;x++)for(let d=0;d<4;d++){
  const nx=x+DIRS[d][0],nz=z+DIRS[d][1];if(nx<0||nz<0||nx>=L.w||nz>=L.h||!L.open.has(L.edgeKey(x,z,d)))continue;
  const other=L.roomOf[L.idx(nx,nz)];if(other>=0&&other!==id)neighbors.add(other);
 }
 return neighbors.size===1&&L.open35.publicRooms.includes([...neighbors][0]);
}

/** Read-only native access plan; selection never consumes a population RNG draw. */
export function planSalvage39(game,ids,sourceSpots=[]){
 const c=context(game);if(!c||!Array.isArray(ids)||ids.length>SALVAGE39.maxItems)return null;
 const {run,fac,L,token,landmarks}=c,P=game.physics,small=ids.map((id,index)=>({it:game.items.get(id),index}));
 const valuable=small.filter(({it,index})=>plain(it)&&it.value>=SALVAGE39.minValue&&!sourceSpots[index]?.item);
 if(!valuable.length)return null;
 const signs=(landmarks.userData.signs||[]).filter(s=>s.role==='bay'&&L.open35.bayRooms.includes(s.room)&&deadend(L,fac,s.room));if(!signs.length)return null;
 // Refresh moved native bodies without integrating a second physics clock.
 P.world.propagateModifiedBodyPositionsToColliders?.();
 const reach=physicalReach21(fac,P),cheap=small.filter(({it})=>plain(it)&&it.value>0&&it.value<SALVAGE39.minValue&&reach(it.obj.position.x,it.obj.position.z));if(!cheap.length)return null;
 const floor=L.y,stand=new RAPIER.Capsule(.56,.36),mask=groups(0xffff,SOLID|G.ITEM|G.BIG);
 const ground=p=>{const hit=P.raycast({x:p.x,y:floor+.3,z:p.z},{x:0,y:-1,z:0},.65,SOLID);return hit&&hit.normal.y>.8&&Math.abs(hit.point.y-floor)<.05;};
 const clear=(p,shape,rotation=IDENTITY,it)=>{let hit=false;P.world.intersectionsWithShape(p,rotation,shape,()=>{hit=true;return false;},undefined,mask,it?.col,it?.body);return !hit;};
 const source=fac.mainDoor.spawn;
 if(!ground(source)||!clear({x:source.x,y:floor+.94,z:source.z},stand))return null;
 const cheapLengths=cheap.map(({it})=>({it,path:reach.pathTo(it.obj.position.x,it.obj.position.z)})).filter(x=>x.path).map(x=>({it:x.it,length:routeLength(x.path.map(p=>[p.x,floor,p.z]))}));
 let sites=0;
 const order=(salt,key)=>(a,b)=>hashString(`${token}:salvage39:${salt}:${key(a)}`)-hashString(`${token}:salvage39:${salt}:${key(b)}`);
 valuable.sort(order('item',x=>`${x.index}:${x.it.type}`));signs.sort(order('room',s=>s.room));
 for(const {it,index}of valuable){
  const size=it.size;if(!size||![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0&&v<3))continue;
  const half={x:Math.max(.05,size.x/2),y:Math.max(.05,size.y/2),z:Math.max(.05,size.z/2)},radius=Math.hypot(half.x,half.z),drop=new RAPIER.Cuboid(half.x+.03,half.y+.03,half.z+.03);
  const occupied=[...sourceSpots.filter((_,i)=>i!==index),...fac.bigSpots,...fac.vaultSpots,...(fac.reactorSpot?[fac.reactorSpot]:[])];
  for(const sign of signs){
   const room=L.rooms[sign.room],spots=fac.scrapSpots.filter(s=>s.room===room.id&&!s.sealed&&!s.item).slice().sort(order('spot',s=>`${s.x}:${s.z}`));
   for(const s of spots){
    if(++sites>SALVAGE39.maxSites)return null;
    const detour=-(s.x-sign.x)*sign.nx-(s.z-sign.z)*sign.nz;if(detour<SALVAGE39.minDetour)continue;
    const minX=L.ox+room.x*L.cell,maxX=minX+room.w*L.cell,minZ=L.oz+room.z*L.cell,maxZ=minZ+room.h*L.cell;
    if(s.x-radius-.05<=minX||s.x+radius+.05>=maxX||s.z-radius-.05<=minZ||s.z+radius+.05>=maxZ||occupied.some(p=>Math.hypot(p.x-s.x,p.z-s.z)<radius+.7))continue;
    const approach={x:s.x+sign.nx*1.5,y:floor,z:s.z+sign.nz*1.5},point={x:s.x,y:floor+half.y+.09,z:s.z};
    if(!reach(approach.x,approach.z)||!ground(s)||!ground(approach)||!clear(point,drop,it.obj.quaternion,it)||!clear({x:approach.x,y:floor+.94,z:approach.z},stand))continue;
    const path=reach.pathTo(approach.x,approach.z)?.map(p=>[p.x,floor,p.z]);if(!path)continue;path.unshift([source.x,floor,source.z]);const length=routeLength(path);
    if(length>SALVAGE39.maxRoute||!cheapLengths.some(x=>L.roomOf[fac.cellAt(x.it.obj.position.x,x.it.obj.position.z)]!==room.id&&x.length+SALVAGE39.minDetour<length))continue;
    const eye={x:approach.x,y:floor+1.62,z:approach.z},delta={x:point.x-eye.x,y:point.y-eye.y,z:point.z-eye.z},distance=Math.hypot(delta.x,delta.y,delta.z);
    if(distance>=2.7||P.raycast(eye,{x:delta.x/distance,y:delta.y/distance,z:delta.z/distance},distance-.08,SOLID))continue;
    return freeze({version:39,token,id:it.id,p:[point.x,point.y,point.z],room:room.id,approach:[approach.x,floor,approach.z],path,length,detour,
     landmark:{id:sign.id,title:{...sign.title},x:sign.x,y:sign.y,z:sign.z,nx:sign.nx,nz:sign.nz}});
   }
  }
 }
 return null;
}

/** Existing native tp event keeps one body/custody identity and delivers to peers. */
export function relocateSalvage39(game,ids,sourceSpots=[]){
 const plan=planSalvage39(game,ids,sourceSpots);if(!plan)return null;
 // Reserve before Session.broadcast self-delivers and mod callbacks can reenter.
 game.run.salvage39={version:39,token:plan.token,id:plan.id,room:plan.room,p:plan.p,approach:plan.approach,landmark:plan.landmark.id};
 game.net.broadcast('it',{e:'tp',id:plan.id,p:plan.p});game.broadcastRun?.(['salvage39']);return plan;
}
