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
  for(const node of plan.nodes) {
    B.box('m:metal_dark',node.x,node.y,node.z,1.15,.42,.22);
    B.box('m:metal_dark',node.x,node.y-.5,node.z,.09,1,.1);
    for(let k=0;k<=node.i;k++)B.box('g:68a8c0',node.x-.35+k*.35,node.y+.12,node.z+.13,.12,.12,.025);
    for(const side of [-1,1])B.box(side<0?'g:d7ac65':'g:84ad91',node.x+side*.4,node.y-.08,node.z+.13,.16,.12,.025);
  }
  return B.build('expedition13-job');
}
