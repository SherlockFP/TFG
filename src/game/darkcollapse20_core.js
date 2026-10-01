export const DC20 = Object.freeze({ darkSeconds:45, warningSeconds:6, maxRooms:2 });
export const collapseToken=run=>`${run?.moon}:${run?.seed}:${run?.day}`;
export const newDarkRoom=id=>({id,dark:0,warning:0,stage:'safe',rev:0});
export function stepDarkRoom(s,dt,occupied,lit) {
  if(!s||s.stage==='collapsed'||!Number.isFinite(dt)||dt<=0)return false;
  dt=Math.min(dt,.25);const previous=s.stage;
  if(!occupied||lit){s.dark=Math.max(0,s.dark-dt*(lit?2:.25));s.warning=0;s.stage='safe';}
  else {const before=s.dark;s.dark+=dt;if(s.dark>=DC20.darkSeconds){s.stage='warning';s.warning=Math.min(DC20.warningSeconds,s.warning+Math.min(dt,s.dark-Math.max(before,DC20.darkSeconds)));}}
  if(previous!==s.stage){s.rev++;return true;}return false;
}
export function roomBounds(L,r) {return {x0:L.ox+r.x*L.cell,x1:L.ox+(r.x+r.w)*L.cell,z0:L.oz+r.z*L.cell,z1:L.oz+(r.z+r.h)*L.cell,y:L.y};}
export const insideRoom=(p,b)=>!!p&&p.x>b.x0&&p.x<b.x1&&p.z>b.z0&&p.z<b.z1&&Math.abs(p.y-b.y)<8;
export function doorFootprintBusy(door,occupants) {
  const a=door?.colArgs;if(!a)return true;
  return occupants.some(p=>p.pos&&Math.abs(p.pos.x-a[0])<=a[3]/2+(p.radius||.5)+.25&&Math.abs(p.pos.z-a[2])<=a[5]/2+(p.radius||.5)+.25&&p.pos.y<=a[1]+a[4]/2+.1&&p.pos.y+(p.height||1.9)>=a[1]-a[4]/2-.1);
}
// Flood actual subcell navigation with every existing obstruction, never just room adjacency.
export function alternateReturn(nav,door,entrance) {
  if(!door?.info||!entrance?.pos||!door.colArgs)return false;
  const L=nav.layout,info=door.info,a=info.a,b=info.b;if(a<0||b<0)return false;
  const world=i=>({x:L.ox+(i%L.w+.5)*L.cell,z:L.oz+(Math.floor(i/L.w)+.5)*L.cell});
  const start=nav.nearestWalkable(...nav.toGrid(entrance.pos.x,entrance.pos.z));if(!start)return false;
  const targets=[a,b].map(i=>{const p=world(i);return nav.nearestWalkable(...nav.toGrid(p.x,p.z));});if(targets.some(p=>!p))return false;
  const had=nav.blockedEdges.has(info.key);nav.blockedEdges.add(info.key);
  try {
    const seen=new Uint8Array(nav.w*nav.h),q=[start];seen[start[1]*nav.w+start[0]]=1;
    for(let n=0;n<q.length;n++){const [x,z]=q[n];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz;if(!nav.inside(xx,zz))continue;const i=zz*nav.w+xx;if(!seen[i]&&nav.canStep(x,z,xx,zz)){seen[i]=1;q.push([xx,zz]);}}}
    return targets.every(([x,z])=>!!seen[z*nav.w+x]);
  }finally{if(!had)nav.blockedEdges.delete(info.key);}
}
