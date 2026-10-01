import {G,RAPIER,groups} from '../physics/physics.js';
// Fixed geometry / standing-body contract. Never evaluated per frame; certificate consumes canonical routes.
export function cabinRoutes23(plan){
 const feet=(x,z)=>Object.freeze({x,y:plan.y+.03,z}),center=feet(plan.x,plan.z),approach=Object.freeze({...plan.approach});
 const spawns=[[-.55,-.55],[.55,-.55],[-.55,.55],[.55,.55]].map(([x,z])=>feet(plan.x+x,plan.z+z));
 return Object.freeze({version:23,half:.56,radius:.36,approachPath:Object.freeze([approach,center]),spawnPaths:Object.freeze(spawns.map(p=>Object.freeze([approach,center,p]))),directPaths:Object.freeze(spawns.map(p=>Object.freeze([approach,p])))});
}
export function certifyCabinRoutes23(physics,plan){
 const proof=cabinRoutes23(plan),shape=new RAPIER.Capsule(proof.half,proof.radius),sign=plan.yaw===0?1:-1;
 const clear=p=>{
  const x=(p.x-plan.x)*sign,z=(p.z-plan.z)*sign;
  // Preview the exact three walls expanded by a standing capsule and controller skin.
  if((Math.abs(Math.abs(x)-1.65)<.46&&Math.abs(z)<2.07)||(Math.abs(z+1.65)<.46&&Math.abs(x)<2.07))return false;
  let blocked=false;physics.world.intersectionsWithShape({x:p.x,y:plan.y+.94,z:p.z},{x:0,y:0,z:0,w:1},shape,()=>{blocked=true;return false;},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));return !blocked;
 };
 for(const path of [...proof.spawnPaths,...proof.directPaths])for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08));
  for(let n=0;n<=steps;n++)if(!clear({x:a.x+(b.x-a.x)*n/steps,z:a.z+(b.z-a.z)*n/steps}))return null;
 }
 return proof;
}
