// Beginner surface admission covers every native/scripted creature spawn without another threat clock or HUD.
import * as THREE from 'three';
import {CREATURES} from './creatures.js';
import {MOONS} from './moons.js';
import {wrapMethod} from './dailyEvents.js';
import {firstSurface,admitFirst,roaming,FIRST21} from './firstdepth21_core.js';
export function installFirstDepth21(game){
 const restores=[];let disposed=false,accepted=0;
 const active=()=>!disposed&&game.isHost&&!game.endless41?.active?.()&&firstSurface(game.run,MOONS[game.run?.moon],game.world?.facility);
 const time=()=>Math.max(0,Number(game.hostData?.moonT)||0);
 const shipPoint=new THREE.Vector3();
 const entries=()=>{const points=[game.world?.facility?.mainDoor,...(game.world?.facility?.fireDoors||[]),game.world?.outdoor?.mainExit].filter(Boolean).map(d=>d.spawn||d.pos).filter(Boolean);if(game.ship?.group?.getWorldPosition)points.push(game.ship.group.getWorldPosition(shipPoint));return points;};
 function admit(type,pos,opts={}){
  return !active()||admitFirst({def:CREATURES[type],pos,opts,time:time(),alive:[...(game.creatures?.host?.values?.()||[])],entries:entries()});
 }
 const manager=game.creatures;
 if(manager?.hostSpawn)restores.push(wrapMethod(manager,'hostSpawn',old=>function(type,pos,opts={}){
  if(!admit(type,pos,opts))return null;
  const c=old.call(this,type,pos,opts);if(c)accepted++;return c;
 }));
 // Native indoor helpers sometimes return true even if hostSpawn refuses; do not charge rejected pressure.
 if(game.hostSpawnCreatureIndoor)restores.push(wrapMethod(game,'hostSpawnCreatureIndoor',old=>function(type,...args){
  if(!active())return old.call(this,type,...args);
  const def=CREATURES[type];
  if(roaming(def)&&(time()<FIRST21.grace||(time()<FIRST21.settle&&((def.dmg||0)>=60||(def.run||0)>=9))))return false;
  const before=accepted,result=old.call(this,type,...args);return accepted>before?result:false;
 }));
 // Native outdoor budget is charged before its spawn; refund only this rejected attempt.
 if(game.hostSpawnOutdoor)restores.push(wrapMethod(game,'hostSpawnOutdoor',old=>function(...args){
  if(!active())return old.apply(this,args);
  if(time()<FIRST21.grace)return;
  const before=accepted,power=game.hostData?.outPowerUsed,result=old.apply(this,args);
  if(accepted===before&&game.hostData&&Number.isFinite(power))game.hostData.outPowerUsed=power;
  return result;
 }));
 return {active,dispose(){disposed=true;restores.reverse().forEach(f=>f());}};
}
