/** Native world custody filter shared by player nudges and creature prop impacts. */
export function looseCargo(it) {
 return !!it && it.state==='world' && !it.holder && !it.owner && !it.carrier && !it.inv && !it.selling && !it.ladder && it.type!=='body' && it.def?.special!=='apparatus' && !!it.body;
}
/** Apply only an impulse to an existing locally authoritative dynamic body. Never move its transform/custody. */
export function impulseCargo(it, direction, {deltaSpeed=.55,maxSpeed=2.5,maxImpulse=12}={}) {
 if(!looseCargo(it)||!it.body.isDynamic?.()||!it.isSimulatedHere?.())return false;
 const x=Number(direction?.x),z=Number(direction?.z),length=Math.hypot(x,z);
 if(!Number.isFinite(length)||length<.01)return false;
 const body=it.body,v=body.linvel(),speed=Math.hypot(v.x,v.z),mass=body.mass();
 if(!Number.isFinite(speed)||!Number.isFinite(mass)||mass<=0||speed>=maxSpeed)return false;
 const dv=Math.min(Math.max(0,deltaSpeed),Math.max(0,maxSpeed-speed)),force=Math.min(Math.max(0,maxImpulse),mass*dv);
 if(!(force>0))return false;
 body.applyImpulse({x:x/length*force,y:0,z:z/length*force},true);return true;
}
export const cargoToken=r=>r?`${r.runId||''}:${r.moon||''}:${r.seed||0}:${r.day||0}:${r.phase||''}`:'';
