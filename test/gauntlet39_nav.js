// DEV QA only: read native geometry, then let the live LocalPlayer walk it.
// No world.step, body/controller allocation, pose writes or outcome injection.
import {G,RAPIER,groups} from '../src/physics/physics.js';
const Q={x:0,y:0,z:0,w:1},SOLID=G.STATIC|G.DOOR,MASK=groups(G.PLAYER,SOLID);
const point=p=>Array.isArray(p)?{x:p[0],y:p[1],z:p[2]}:{x:p?.x,y:p?.y,z:p?.z};
const finite=p=>[p.x,p.y,p.z].every(Number.isFinite);
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

/** Bounded adaptive-floor A*: returns frozen actual [x,y,z] points or null.
 * .40m steps stay under native .42m autostep; no jump/mantle.
 * Floor probes follow the current floor, so a roof cannot be selected from sky.
 * A successful plan is source-assisted geometry evidence, not a walked result.
 */
export function certifiedWalk39(physics,start,target,options={}){
 const a=point(start),goal=point(target);if(!finite(a)||!finite(goal)||!physics?.world||!physics.raycast)return null;
 const cell=Math.max(.25,Math.min(.5,options.cell??.5)),margin=Math.max(2,Math.min(12,options.margin??12)),step=Math.max(.05,Math.min(.42,options.maxStep??.4));
 // Include the native controller's .02m offset in the route clearance.
 const maxNodes=Math.max(100,Math.min(10000,options.maxNodes??8000)),sample=Math.min(.125,cell/4),shape=new RAPIER.Capsule(.56,.36);
 const bounds={x0:Math.min(a.x,goal.x)-margin,x1:Math.max(a.x,goal.x)+margin,z0:Math.min(a.z,goal.z)-margin,z1:Math.max(a.z,goal.z)+margin};
 physics.world.propagateModifiedBodyPositionsToColliders?.();
 let probes=0,expanded=0;
 const report=(reason,nodes)=>options.report?.({reason,expanded,nodes,probes,bounds:{...bounds}});
 const ground=(x,z,y)=>{probes++;const hit=physics.raycast({x,y:y+.6,z},{x:0,y:-1,z:0},1.5,SOLID);return hit&&hit.normal.y>.65&&Math.abs(hit.point.y-y)<=step+.01?{x,y:hit.point.y,z}:null;};
 const clear=(p,dx=0,dz=0)=>{
  let floor=p.y;
  // Native autostep raises the capsule before its centre crosses a stair's
  // leading edge. Require the higher physical top to extend at least .16m
  // (native minimum autostep width), then test the entire standing capsule.
  for(const [ox,oz]of [[dx*.35,dz*.35],[-dx*.35,-dz*.35],[-dz*.35,dx*.35],[dz*.35,-dx*.35]]){
   if(!ox&&!oz)continue;const support=ground(p.x+ox,p.z+oz,p.y);if(!support||support.y<=floor+.025)continue;
   const farther=ground(p.x+ox*1.46,p.z+oz*1.46,support.y);if(!farther||Math.abs(farther.y-support.y)>step)continue;
   floor=Math.max(floor,support.y);
  }
  let hit=false;probes++;physics.world.intersectionsWithShape({x:p.x,y:floor+.94,z:p.z},Q,shape,()=>{hit=true;return false;},undefined,MASK);return hit?null:floor;
 };
 const edge=(from,x,z)=>{
  const dx=x-from.x,dz=z-from.z,len=Math.hypot(dx,dz);if(len<1e-7)return from;const nx=dx/len,nz=dz/len,n=Math.max(1,Math.ceil(len/sample));let previous=from,previousFloor=clear(from,nx,nz);if(previousFloor===null)return null;
  for(let i=1;i<=n;i++){
   const p=ground(from.x+dx*i/n,from.z+dz*i/n,previous.y);if(!p)return null;const standingFloor=clear(p,nx,nz);if(standingFloor===null)return null;
   const vx=p.x-previous.x,vz=p.z-previous.z,d=Math.hypot(vx,vz),floor=Math.max(previousFloor,standingFloor);
   // Native capsule sweep at the higher step level clears actual wall/corner
   // geometry while avoiding a false hit on the climbable floor itself.
   probes++;if(physics.world.castShape({x:previous.x,y:floor+.94,z:previous.z},Q,{x:vx,y:0,z:vz},shape,.005,1,true,undefined,MASK))return null;
   for(const side of [-.34,0,.34])for(const h of [.5,1.25]){
    probes++;if(physics.raycast({x:previous.x-vz/d*side,y:floor+h,z:previous.z+vx/d*side},{x:vx/d,y:0,z:vz/d},d,SOLID))return null;
   }
   previous=p;previousFloor=standingFloor;
  }
  return previous;
 };
 const initial=ground(a.x,a.z,a.y);if(!initial||clear(initial)===null){report('start-blocked',0);return null;}
 const heuristic=p=>Math.hypot(p.x-goal.x,p.z-goal.z),key=(ix,iz,y)=>`${ix}:${iz}:${Math.round(y*20)}`;
 const open=[],seen=new Map(),push=node=>{open.push(node);let i=open.length-1;while(i){const p=(i-1)>>1;if(open[p].f<=node.f)break;open[i]=open[p];i=p;}open[i]=node;};
 const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let c=i*2+1;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(open[c].f>=last.f)break;open[i]=open[c];i=c;}open[i]=last;}return first;};
 const first={...initial,ix:0,iz:0,g:0,f:heuristic(initial),parent:null};seen.set(key(0,0,first.y),first);push(first);
 while(open.length&&expanded<maxNodes){
  const current=pop();if(current.closed)continue;current.closed=true;expanded++;
  if(heuristic(current)<=cell*1.5){const end=edge(current,goal.x,goal.z);if(end&&Math.abs(end.y-goal.y)<.3){const path=[[end.x,end.y,end.z]];for(let p=current;p;p=p.parent)path.push([p.x,p.y,p.z]);path.reverse();report('ok',seen.size);return Object.freeze(path.map(Object.freeze));}}
  for(const [dx,dz]of DIRS){
   const ix=current.ix+dx,iz=current.iz+dz,x=a.x+ix*cell,z=a.z+iz*cell;if(x<bounds.x0||x>bounds.x1||z<bounds.z0||z>bounds.z1)continue;
   const next=edge(current,x,z);if(!next)continue;const id=key(ix,iz,next.y),g=current.g+Math.hypot(dx,dz)*cell,old=seen.get(id);if(old&&old.g<=g)continue;
   const node={...next,ix,iz,g,f:g+heuristic(next),parent:current};seen.set(id,node);push(node);
  }
 }
 report(expanded>=maxNodes?'budget':'no-route',seen.size);return null;
}
