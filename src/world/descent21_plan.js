import {NavGrid} from './nav.js';
import {navClear} from './interiors/common.js';
const excluded=r=>r.maze||r.arena||r.treasure||r.m2ch||r.type.startsWith('m2_')||['vault','core','generator','nest','arena'].includes(r.type);
// Post-build: honor final furniture/nav and every existing required lock.
export function planDescent21(fac,{clear=()=>true,reachable=()=>true}={}){
 const L=fac.layout,nav=fac.nav,C=L.cell,entry=fac.mainDoor?.info?.a??L.entrySources[0],start={x:L.ox+(entry%L.w+.5)*C,z:L.oz+(Math.floor(entry/L.w)+.5)*C};
 const rooms=L.rooms.filter(r=>!excluded(r)&&r.type!=='entrance').sort((a,b)=>(L.distOf[L.idx(b.cx,b.cz)]||0)-(L.distOf[L.idx(a.cx,a.cz)]||0));
 const discoveryNav=new NavGrid(L,nav.res);discoveryNav.walk.set(nav.walk);discoveryNav.blockedEdges=new Set(nav.blockedEdges);
 // Only discovery eligibility relaxes a normal key-unlockable door. Physical placement remains on the original nav.
 for(const door of fac.doors){const info=door.info;if(door.kind!=='door'||info?.type!=='door'||info.treasure||info.arena||info.shortcut||info.required||info.permanent||info.code)continue;const a=L.rooms[L.roomOf[info.a]],b=L.rooms[L.roomOf[info.b]];if(a&&excluded(a)||b&&excluded(b))continue;discoveryNav.blockedEdges.delete(info.key);}
 const discoveryRooms=rooms.filter(r=>discoveryNav.findPath(start.x,start.z,L.ox+(r.cx+.5)*C,L.oz+(r.cz+.5)*C,90000)).map(r=>r.id);
 for(const r of [...rooms,...L.rooms.filter(r=>r.type==='entrance')]){
  if((L.heightOf[L.idx(r.cx,r.cz)]||0)<3.2)continue;
  const x0=L.ox+r.x*C,z0=L.oz+r.z*C,x1=x0+r.w*C,z1=z0+r.h*C;
  for(const [x,z,yaw] of [[x0+2.6,z0+2.6,0],[x1-2.6,z0+2.6,0],[x0+2.6,z1-2.6,Math.PI],[x1-2.6,z1-2.6,Math.PI],[(x0+x1)/2,z0+2.6,0],[(x0+x1)/2,z1-2.6,Math.PI],[(x0+x1)/2,(z0+z1)/2,0],[(x0+x1)/2,(z0+z1)/2,Math.PI]]){
   if(!navClear(nav,x-2.1,z-2.1,x+2.1,z+2.1,0)||!clear(x,z,L.y))continue;
   const direction=yaw===0?1:-1,approach={x,y:L.y,z:z+direction*2.3};
   if(!nav.findPath(start.x,start.z,approach.x,approach.z,90000)||!reachable(approach.x,approach.z))continue;
   return Object.freeze({roomId:r.id,discoveryRooms:Object.freeze(discoveryRooms),requiredRooms:15,x,z,y:L.y,yaw,approach:Object.freeze(approach),spawn:Object.freeze({x,y:L.y+.03,z}),returnSpawn:Object.freeze(approach),boundary:Object.freeze({x0:x-1.45,x1:x+1.45,z0:z-1.4,z1:z+1.4,y0:L.y,y1:L.y+2.8})});
  }
 }
 return null; // Never install an unsafe console or silently bypass a required gate.
}
// Certificate is tied to native generation AND final static nav/furniture, never foreign resource handles.
export function descentFingerprint21(fac){
 const L=fac.layout;let hash=2166136261;const byte=n=>{hash=Math.imul(hash^(n&255),16777619)>>>0;};
 for(const value of L.cells)byte(value);for(const value of fac.nav.walk)byte(value);
 const structural=JSON.stringify([L.rooms.map(r=>[r.id,r.x,r.z,r.w,r.h,r.type,!!r.maze,!!r.arena]),[...L.open].sort((a,b)=>a-b),[...fac.nav.blockedEdges].sort((a,b)=>a-b)]);
 for(let i=0;i<structural.length;i++){byte(structural.charCodeAt(i));byte(structural.charCodeAt(i)>>8);}
 return Object.freeze({seed:L.seed,theme:L.theme,w:L.w,h:L.h,hash});
}
export function verifiedDescentPlan21(fac,verified){
 if(!verified?.fingerprint||!Number.isFinite(verified.x)||!Number.isFinite(verified.z)||!Number.isInteger(verified.roomId))return null;
 const actual=descentFingerprint21(fac);for(const key of ['seed','theme','w','h','hash'])if(actual[key]!==verified.fingerprint[key])return null;
 return planDescent21(fac,{clear:(x,z)=>x===verified.x&&z===verified.z&&fac.layout.rooms[verified.roomId]?.id===verified.roomId});
}
