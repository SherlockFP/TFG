import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { LabBuilder } from './interiors/lab_kit.js';
import { districtRoutes } from './districts13.js';
/** Pick existing safe rooms and an existing bonus vault; no new floor cuts, colliders or room topology. */
export function planRelayVault(fac, gateId = null) {
  const L = fac?.layout; if (!L || !fac.nav || !fac.mainDoor?.spawn) return null;
  const distances = districtRoutes(L).distance, start = fac.mainDoor.spawn;
  const door = fac.doors.find(d => d.kind === 'vault' && (d.locked || d.id === gateId) && !d.contain && !d.info?.arena && !d.info?.treasure && d.keypadPos && fac.nav.findPath(start.x,start.z,d.keypadPos.x,d.keypadPos.z,60000));
  if (!door) return null;
  const candidates = L.rooms.filter(r => !['entrance','vault','generator','core','nest'].includes(r.type) && !r.arena && !r.treasure && distances[L.idx(r.cx,r.cz)] >= 0).sort((a,b)=>distances[L.idx(a.cx,a.cz)]-distances[L.idx(b.cx,b.cz)]);
  const chosen = [0.15,0.5,0.85].map(f=>candidates[Math.floor((candidates.length-1)*f)]).filter((r,i,a)=>r && a.indexOf(r)===i);
  const nodes = chosen.map((r,i)=>{
    const x=L.ox+(r.cx+.5)*L.cell,z=L.oz+(r.cz+.5)*L.cell;
    const grid=fac.nav.nearestWalkable(...fac.nav.toGrid(x,z),2); if(!grid)return null;
    const p=fac.nav.toWorld(...grid);if(!fac.nav.findPath(start.x,start.z,p.x,p.z,60000))return null;
    return { i,x:p.x,y:L.y+1.3,z:p.z };
  }).filter(Boolean);
  return nodes.length === 3 ? { kind:'vault', nodes, door, anchor: door.keypadPos.clone(), Y:L.y, group:fac.group } : null;
}
export function planSignalRun(world) {
  const terrain=world?.terrain,out=world?.outdoor, path=terrain?.pathPts;
  if (!out?.group || !path || terrain.hook || terrain.lava || path.length < 12) return null;
  const nodes=[];
  for(const f of [.22,.5,.78]) {
    const center=Math.floor((path.length-1)*f); let chosen=null;
    for(const offset of [0,-1,1,-2,2]) {
      const p=path[center+offset];if(!p)continue;
      const y=terrain.heightAt(p.x,p.z);
      if(Math.hypot(p.x,p.z)<14 || out.solidAt?.(p.x,p.z,.7,y) || terrain.blocked?.(p.x,p.z,.7))continue;
      if(nodes.some(n=>Math.hypot(n.x-p.x,n.z-p.z)<7))continue;
      chosen={i:nodes.length,x:p.x,y:y+1.3,z:p.z};break;
    }
    if(!chosen)return null;nodes.push(chosen);
  }
  return { kind:'signal',nodes,anchor:new THREE.Vector3(nodes[0].x,nodes[0].y,nodes[0].z),Y:0,group:out.group };
}
export function buildFieldJob(plan) {
  const B=new LabBuilder({Y:plan.Y,group:plan.group,GeoBuilder,levelMaterial});
  // Recovery tray and amber mast sit along the real path. Keep the item centre unobstructed.
  if(plan.kind==='repair'){const p=plan.fusePos;B.box('m:metal_dark',p.x,p.y-.15,p.z,1.2,.18,.8);B.box('m:metal_dark',p.x+.8,p.y+.4,p.z,.06,1.2,.06);B.box('g:d7ac65',p.x+.8,p.y+1.05,p.z,.24,.2,.24);}
  for(const node of plan.nodes) {
    if(plan.kind==='repair'){B.box('m:metal_dark',node.x,node.y-.6,node.z,1.9,.55,.85);for(const side of [-1,1])B.box('m:metal_dark',node.x+side*1.1,node.y-.4,node.z,.65,.08,.65);}
    if(plan.kind==='uplink'){B.box('m:metal_dark',node.x,node.y+1,node.z,.08,2,.08);B.box('g:68a8c0',node.x,node.y+1.7,node.z,.8,.12,.08);}
    B.box('m:metal_dark',node.x,node.y,node.z,1.15,.42,.22);
    B.box('m:metal_dark',node.x,node.y-.5,node.z,.09,1,.1);
    for(let k=0;k<=node.i;k++)B.box('g:68a8c0',node.x-.35+k*.35,node.y+.12,node.z+.13,.12,.12,.025);
    for(const side of [-1,1])B.box(side<0?'g:d7ac65':'g:84ad91',node.x+side*.4,node.y-.08,node.z+.13,.16,.12,.025);
  }
  return B.build('expedition13-job');
}

/** Outdoor jobs use the same verified path samples; repair separates recovery and work sites. */
export function planField17(world,kind) {
 if(kind!=='repair'&&kind!=='uplink')return null;
 const legacy=planSignalRun(world);
 if(legacy)return {...legacy,kind,anchor:new THREE.Vector3(legacy.nodes[1].x,legacy.nodes[1].y,legacy.nodes[1].z),fusePos:new THREE.Vector3(legacy.nodes[0].x,legacy.nodes[0].y-.9,legacy.nodes[0].z),nodes:[legacy.nodes[1]]};
 // A single-station job must not depend on unused legacy beacon sites.
 const terrain=world?.terrain,out=world?.outdoor,path=terrain?.pathPts;
 if(!out?.group||!path||path.length<12||terrain.hook||terrain.lava)return null;
 const safe=i=>{const p=path[i];if(!p)return null;const y=terrain.heightAt(p.x,p.z);if(!Number.isFinite(y)||Math.hypot(p.x,p.z)<14||out.solidAt?.(p.x,p.z,.7,y)||terrain.blocked?.(p.x,p.z,.7))return null;return {i:0,x:p.x,y:y+1.3,z:p.z};};
 const center=Math.floor((path.length-1)*.5);let station=null;
 for(const offset of [0,-1,1,-2,2,-3,3,-4,4]){station=safe(center+offset);if(station)break;}
 if(!station)return null;
 let fuse=null;
 if(kind==='repair')for(let i=1;i<Math.min(path.length-1,65);i++){const n=safe(i);if(n&&Math.hypot(n.x-station.x,n.z-station.z)>=7){fuse=n;break;}}
 if(kind==='repair'&&!fuse)return null;
 return {kind,nodes:[station],anchor:new THREE.Vector3(station.x,station.y,station.z),fusePos:fuse?new THREE.Vector3(fuse.x,fuse.y-.9,fuse.z):null,Y:0,group:out.group};
}
