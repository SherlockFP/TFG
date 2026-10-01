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
/** A rolling load is approaching this crew member, rather than sliding away or across them. */
export function approachingCargo(it, position, {minSpeed=.7,minDot=.35}={}) {
 if(!it?.body||!position)return false;
 const p=it.body.translation(),v=it.body.linvel(),speed=Math.hypot(v.x,v.z);
 const x=Number(position.x)-p.x,z=Number(position.z)-p.z,distance=Math.hypot(x,z);
 return Number.isFinite(speed)&&speed>=minSpeed&&Number.isFinite(distance)&&distance>.05&&(v.x*x+v.z*z)/(speed*distance)>=minDot;
}
/** Oppose horizontal motion with a bounded native impulse; gravity and ownership stay native. */
export function brakeCargo(it, {deltaSpeed=2.2,maxImpulse=120}={}) {
 if(!looseCargo(it)||!it.body.isDynamic?.()||!it.isSimulatedHere?.())return false;
 const body=it.body,v=body.linvel(),speed=Math.hypot(v.x,v.z),mass=body.mass();
 if(!Number.isFinite(speed)||speed<.7||!Number.isFinite(mass)||mass<=0)return false;
 const dv=Math.min(Math.max(0,deltaSpeed),2.2,speed),force=Math.min(Math.max(0,maxImpulse),120,mass*dv);
 if(!(force>0))return false;
 body.applyImpulse({x:-v.x/speed*force,y:0,z:-v.z/speed*force},true);return true;
}
export const cargoToken=r=>r?`${r.runId||''}:${r.moon||''}:${r.seed||0}:${r.day||0}:${r.phase||''}`:'';
