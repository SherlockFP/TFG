// Three finite, original ground-floor geometries. Native nav/custody owns play.
import * as THREE from 'three';
import {GeoBuilder} from '../geobuilder.js';
import {layoutKit,navClear} from './common.js';
import {addTranslations} from '../../core/i18n.js';
export const LAB24_IDS=Object.freeze(['deadletter24','mutedswitch24','permissions24']);
export function planLab24(ctx){
 const {arch,W,H,ent,cells,idx,addRoom,line,spines}=ctx;if(!LAB24_IDS.includes(arch)||W<30||H<30)return false;
 const cx=ent.cx,mid=Math.round(H*.5),bottom=ent.z-2,left=5,right=W-6;
 const room=(x,z,w,h,type,role)=>{if(x<2||z<2||x+w>W-2||z+h>H-2)return null;for(let zz=z-1;zz<=z+h;zz++)for(let xx=x-1;xx<=x+w;xx++)if(cells[idx(xx,zz)])return null;const r=addRoom(x,z,w,h,type);r.lab24Role=role;r.hub=true;return r;};
 const route=(x,z,a,b)=>{line(x,z,a,b);if(arch==='permissions24'){let px=x,pz=z;while(true){line(px,pz,px+(x===a?1:0),pz+(x===a?0:1));if(px===a&&pz===b)break;px+=Math.sign(a-px);pz+=Math.sign(b-pz);}}if(x===a)spines.push({axis:'z',c:x,a:Math.min(z,b),b:Math.max(z,b)});else if(z===b)spines.push({axis:'x',c:z,a:Math.min(x,a),b:Math.max(x,a)});};
 let arena,service;
 if(arch==='deadletter24'){
  arena=room(cx-3,4,7,7,'dl_dispatch','arena');service=room(left-1,mid-2,4,5,'dl_returns','covered');room(right-3,mid-5,5,4,'dl_sorting','exposed');
  route(cx,ent.cz,cx,7);route(cx,bottom,left,bottom);route(left,bottom,left,7);route(left,7,cx,7);route(cx,mid-3,right-1,mid-3);
 }else if(arch==='mutedswitch24'){
  arena=room(cx-3,mid-3,7,7,'ms_switchboard','arena');service=room(left-1,mid-2,4,5,'ms_booths','covered');room(right-2,6,4,4,'ms_calls','exposed');
  route(cx,ent.cz,cx,mid);for(const x of [left,right])route(x,5,x,bottom);for(const z of [5,bottom])route(left,z,right,z);route(left,mid,cx,mid);route(cx,mid,right,mid);route(cx,5,cx,mid);
 }else{
  arena=room(cx-4,4,9,6,'ep_court','arena');service=room(cx-8,mid-2,4,6,'ep_service','covered');room(cx+5,mid-4,4,5,'ep_access','exposed');
  const a=cx-7,b=cx+7;route(cx,ent.cz,cx,bottom);route(a,bottom,b,bottom);route(a,6,a,bottom);route(b,6,b,bottom);route(a,6,b,6);route(cx,6,cx,4);route(a,mid,b,mid);
 }
 if(arena){arena.lab24Arena=true;arena.lab24Service=service?.id??null;}
 return true;
}
const roomStyle=(floor,wall)=>({floor,wall,ceil:'metal_dark',lamp:'wall_lamp',center:null,wall_:[],clutter:[]});
function theme(id,name,blurb,floor,wall){const styles={};for(const type of ['entrance','storage','generator','vault','nest','dl_dispatch','dl_returns','dl_sorting','ms_switchboard','ms_booths','ms_calls','ep_court','ep_service','ep_access'])styles[type]=roomStyle(floor,wall);
 return {id,name,blurb,style:{corridor:{floor,wall,ceil:'metal_dark',base:'metal_dark'},rooms:styles},roomTypes:[['storage',3],['storage',1,true]],roomHeight:type=>['dl_dispatch','ms_switchboard','ep_court'].includes(type)?5.2:3.8,
 layout:{plan:'wings',arch:id,loops:0,hub:null,doorP:0,blastP:0,lockedP:0,roomMul:.45,bigChance:.15,corridorH:3.6},lamps:{corridor:'wall_lamp',every:6,color:0xd4bea0,flicker:0},lampColor:0xd4bea0,doorProp:'door_single',landmarks:['filing_cabinet'],posters:['poster_delete'],corridorScrap:.05,
 footstep:{wood_floor:'wood',metal_plate:'metal',carpet_office:'carpet'},ambience:{base:'ambience_facility',vol:.3,buzz:'lights_buzz',buzzVol:.025,env:'facility'},atmosphere:{fog:0x15191d,density:.018},noFlood:Object.keys(styles),decorate:ctx=>decorate(ctx,id)};
}
export const LAB24_THEMES={
 deadletter24:theme('deadletter24','Dead Letter Sorting Hall','The exposed dispatch spine is short. Return bays shelter a longer loop.','wood_floor','brick'),
 mutedswitch24:theme('mutedswitch24','Muted Exchange','A central switchboard court meets a looping ring of disconnected call booths.','carpet_office','wall_office'),
 permissions24:theme('permissions24','Expired Permission Office','Twin access galleries lead to one archive court. Service cover trades distance for shelter.','metal_plate','concrete'),
};
addTranslations({'Dead Letter Sorting Hall':'İade Posta Tasnif Salonu','Muted Exchange':'Sessiz Santral','Expired Permission Office':'Süresi Dolmuş İzin Bürosu','The exposed dispatch spine is short. Return bays shelter a longer loop.':'Açık sevk hattı kısa. İade bölmeleri uzun döngüde siper sağlar.','A central switchboard court meets a looping ring of disconnected call booths.':'Merkezi santral avlusunu bağlantısı kesik telefon bölmeleri çevreler.','Twin access galleries lead to one archive court. Service cover trades distance for shelter.':'İki erişim galerisi tek arşiv avlusuna çıkar. Servis yolu daha uzun ama siperlidir.'},'tr');
addTranslations({'Dead Letter Sorting Hall':'Зал невручённых писем','Muted Exchange':'Безмолвный коммутатор','Expired Permission Office':'Бюро истёкших разрешений','The exposed dispatch spine is short. Return bays shelter a longer loop.':'Открытая линия отправки короткая. Возвратные отсеки укрывают длинный обход.','A central switchboard court meets a looping ring of disconnected call booths.':'Центральный коммутатор окружён кольцом отключённых кабин.','Twin access galleries lead to one archive court. Service cover trades distance for shelter.':'Две галереи ведут в архивный двор. Служебный обход длиннее, но даёт укрытие.'},'ru');
function decorate(ctx,id){
 const {layout:L,Y,group,nav,addBox,propBoxes}=ctx,K=layoutKit(L),root=new THREE.Group();root.name=`lab24-${id}`;group.add(root);
 const gb=new GeoBuilder(),mats=[],cover=[],rooms=L.rooms.filter(r=>r.lab24Role),arenaRoom=rooms.find(r=>r.lab24Arena),palette={steel:0x666f72,ivory:0xbdb59e,ochre:0xa18351,dark:0x343c40,rust:0x795a46};
 const box=(key,x,y,z,w,h,d)=>gb.box(key,x,y,z,w,h,d,.18);
 for(const r of rooms){const R=K.roomRect(r),x=(R.x0+R.x1)/2,z=(R.z0+R.z1)/2;
  // Suspended sorting rails / ring switchboard ribs / repeated permission lintels
  // have different silhouettes while every walking surface remains at native Y.
  if(id==='deadletter24'){for(const dx of [-1.6,1.6])box('steel',x+dx,Y+3.05,z,.17,.18,Math.min(10,r.h*K.C-1));for(let n=-2;n<=2;n++)box('ivory',x,Y+3.3,z+n*1.25,1.3,.4,.7);}
  else if(id==='mutedswitch24'){for(const dx of [-2.3,2.3]){box('steel',x+dx,Y+3.1,z,.3,.45,Math.min(10,r.h*K.C-1));for(let n=-2;n<=2;n++)box('ochre',x+dx,Y+2.8,z+n*1.2,.45,.25,.5);}}
  else{for(const dz of [-2,0,2]){box('ivory',x,Y+3.25,z+dz,Math.min(12,r.w*K.C-1),.18,.25);box('ochre',x-.8,Y+3.18,z+dz,.2,.08,.3);}}
  for(const [sx,sz]of [[R.x0+2.2,R.z0+2.2],[R.x1-2.2,R.z1-2.2]]){
   const w=id==='mutedswitch24'?1.5:2,d=id==='permissions24'?.45:.7,h=id==='deadletter24'?1.1:1.8;
   if(!navClear(nav,sx-w/2,sz-d/2,sx+w/2,sz+d/2,.45))continue;
   box('dark',sx,Y+h/2,sz,w,h,d);box('ivory',sx,Y+h+.035,sz,w+.04,.07,d+.04);addBox(sx,Y+h/2,sz,w,h,d,undefined,{kind:'lab24-cover',theme:id});nav.blockBox(sx-w/2,sz-d/2,sx+w/2,sz+d/2,.15);propBoxes.push([sx-w/2,sz-d/2,sx+w/2,sz+d/2]);cover.push(Object.freeze({x:sx,y:Y+h/2,z:sz,size:Object.freeze([w,h,d]),room:r.id}));
  }
 }
 root.add(gb.build(key=>{const m=new THREE.MeshLambertMaterial({color:palette[key],vertexColors:true,flatShading:true});m.userData.shared=true;mats.push(m);return m;}));const geometries=[];let batches=0,triangles=0;root.traverse(o=>{if(o.geometry){o.geometry.userData.shared=true;geometries.push(o.geometry);batches++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 const world=(r)=>({x:K.wx(r.cx)+K.C/2,y:Y,z:K.wz(r.cz)+K.C/2,room:r.id}),entry=world(L.entrance.room),arena=arenaRoom?Object.freeze({...world(arenaRoom),radius:Math.max(3.2,Math.min(arenaRoom.w,arenaRoom.h)*K.C/2-4),w:arenaRoom.w*K.C,h:arenaRoom.h*K.C}):null;
 const service=rooms.find(r=>r.lab24Role==='covered'),path=(a,b)=>routeWaypoints(nav,a,b,Y),target=arena||entry;
 const gallery=id==='permissions24'?rooms.find(r=>r.lab24Role==='exposed'):null,exposed=gallery?[...path(entry,world(gallery)),...path(world(gallery),target)]:path(entry,target),via=service?world(service):target,covered=[...path(entry,via),...path(via,target)];
 const spawnSpots=[];for(const r of rooms){const p=world(r);for(const [dx,dz]of [[0,0],[-1.8,0],[1.8,0],[0,-1.8],[0,1.8]])if(navClear(nav,p.x+dx-.5,p.z+dz-.5,p.x+dx+.5,p.z+dz+.5,0))spawnSpots.push(Object.freeze({...p,x:p.x+dx,z:p.z+dz}));}
 let disposed=false;return {lab:{id,arena,routes:Object.freeze({exposed:Object.freeze(exposed),covered:Object.freeze(covered)}),cover:Object.freeze(cover),spawnSpots:Object.freeze(spawnSpots),metrics:{batches,triangles,emitters:0,colliders:cover.length},dispose(){if(disposed)return;disposed=true;for(const geometry of geometries)geometry.dispose();for(const m of mats)m.dispose();root.removeFromParent();}}};
}

// Cardinal native navigation waypoints preserve doorway centers. Smoothed A*
// diagonals can skim a physical frame even when its cell graph is connected.
function routeWaypoints(nav,a,b,y){
 const [sx,sz]=nav.toGrid(a.x,a.z),[tx,tz]=nav.toGrid(b.x,b.z);if(!nav.isWalkable(sx,sz)||!nav.isWalkable(tx,tz))return [];
 const start=sz*nav.w+sx,goal=tz*nav.w+tx,parent=new Int32Array(nav.w*nav.h).fill(-2),queue=[start];parent[start]=-1;
 for(let n=0;n<queue.length&&n<90000;n++){const i=queue[n];if(i===goal)break;const x=i%nav.w,z=Math.floor(i/nav.w);for(const [dx,dz]of [[0,-1],[-1,0],[1,0],[0,1]]){const nx=x+dx,nz=z+dz,j=nz*nav.w+nx;if(!nav.inside(nx,nz)||parent[j]!==-2||!nav.canStep(x,z,nx,nz))continue;parent[j]=i;queue.push(j);}}
 if(parent[goal]===-2)return [];const indices=[];for(let i=goal;i!==-1;i=parent[i])indices.push(i);indices.reverse();
 const points=[Object.freeze({...a})];for(let n=0;n<indices.length;n++){const i=indices[n];if(n>0&&n<indices.length-1&&indices[n]-indices[n-1]===indices[n+1]-indices[n])continue;points.push(Object.freeze({...nav.toWorld(i%nav.w,Math.floor(i/nav.w)),y}));}points.push(Object.freeze({...b}));return points;
}
