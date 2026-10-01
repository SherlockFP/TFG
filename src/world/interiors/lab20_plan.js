// Pure authored spines; the native facility fill/connectivity/door passes remain authoritative.
export function planLab20(ctx){
 const {arch,W,H,ent,cells,idx,addRoom,line,spines}=ctx;
 if(!['thread20','buffer20'].includes(arch)||W<30||H<30)return false;
 const room=(x,z,w,h,type,role)=>{
  if(x<2||z<2||x+w>W-2||z+h>H-2)return null;
  for(let zz=z-1;zz<=z+h;zz++)for(let xx=x-1;xx<=x+w;xx++)if(cells[idx(xx,zz)])return null;
  const r=addRoom(x,z,w,h,type);r.lab20Role=role;r.loopChoice=role==='optional';return r;
 };
 const route=(x0,z0,x1,z1)=>{line(x0,z0,x1,z1);if(x0===x1)spines.push({axis:'z',c:x0,a:Math.min(z0,z1),b:Math.max(z0,z1)});else if(z0===z1)spines.push({axis:'x',c:z0,a:Math.min(x0,x1),b:Math.max(x0,x1)});};
 const cx=ent.cx,zBottom=ent.z-2;
 if(arch==='thread20'){
  const middle=Math.round(H*.45),hub=room(cx-2,middle-2,5,4,'reply_hub','trunk');if(hub)hub.hub=true;
  const left=5,right=W-6,upper=6,lower=Math.max(upper+9,H-16);
  const branches=[room(left-2,upper-2,4,4,'reply_branch','optional'),room(right-2,upper+3,4,4,'thread_stack','optional'),room(left-2,lower-2,4,4,'thread_stack','optional'),room(right-2,lower+3,4,4,'reply_branch','optional')].filter(Boolean);
  route(cx,3,cx,ent.cz);
  for(const r of branches)route(cx,r.cz,r.cx,r.cz);
  // Two reply-feedback loops reconnect to the same trunk, not four compulsory dead ends.
  const l=branches.filter(r=>r.cx<cx).sort((a,b)=>a.cz-b.cz),r=branches.filter(r=>r.cx>cx).sort((a,b)=>a.cz-b.cz);
  if(l.length>1)route(l[0].cx,l[0].cz,l[1].cx,l[1].cz);
  if(r.length>1)route(r[0].cx,r[0].cz,r[1].cx,r[1].cz);
 }else{
  const a=cx-5,b=cx+5,mid=Math.round(H*.47),outerA=3,outerB=W-4;
  const hub=room(cx-3,mid-2,7,5,'sorting_hall','trunk');if(hub)hub.hub=true;
  room(a-1,5,3,5,'process_hall','process');room(b-1,H-11,3,5,'process_hall','process');
  room(outerA-1,mid-2,3,4,'service_store','optional');room(outerB-1,mid-2,3,4,'service_store','optional');
  for(const x of [a,b])route(x,4,x,zBottom);
  for(const z of [4,mid,zBottom])route(a,z,b,z);
  route(cx,zBottom,cx,ent.cz);
  // An outer rectangular service loop is independent of the noisy processing lanes.
  for(const x of [outerA,outerB])route(x,4,x,zBottom);
  for(const z of [4,zBottom])route(outerA,z,outerB,z);
 }
 return true;
}
