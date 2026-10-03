import * as THREE from 'three';
import {registerCreature,CREATURES,canSpawnMore} from './creatures.js';
import {RAPIER,G,groups} from '../physics/physics.js';
import {RNG} from '../core/rng.js';
import {descentToken} from './descent21_state.js';
import {isSellable} from './items.js';
import {MOONS} from './moons.js';
import {creatureBaseLevel} from './progression.js';
export const C32_IDS=['c32_dormant','c32_ram'];
export const C32=Object.freeze({wake:1.5,swipe:.8,chase:6,restDormant:4,ramWarning:1.4,ramSpeed:6.5,ramDistance:8,ramTime:1.25,restRam:2.5,damageCap:35});
const Q={x:0,y:0,z:0,w:1},ZERO={x:0,y:0,z:0},MASK=groups(0xffff,G.STATIC|G.DOOR);
const owned=id=>C32_IDS.includes(id),offensive=state=>['wake','chase','windup','charge'].includes(state);
let registered=false;
function suppressed(game){return !!game.deadletter24?.active?.()||!!game.escape14?.active?.()||!!game.missions14?.active?.();}
function eligiblePlayers32(c,M){return M.playersFor(c).filter(p=>!p.dead&&!p.downed&&!M.game.downed?.isDowned?.(p.id)&&!p.inShip&&!M.nearSafeZone(p)&&(!M.game.net?.players?.size||M.game.net.players.has(p.id))&&!M.game.net?.lost?.has(p.id));}
function crew32(M){return new Set(M.game.net?.players?.size?M.game.net.players.keys():M.game.aiPlayers().map(p=>p.id));}
function roomBusy32(c,M){const F=M.game.world?.facility,L=F?.layout;if(!F?.cellAt)return false;const room=L.roomOf[F.cellAt(c.pos.x,c.pos.z)];if(room<0)return false;for(const other of M.host.values())if(other!==c&&!other.dead&&other.zone==='in'&&other.target&&['wake','chase','windup','charge','run','attack','hunt','lunge','stab'].includes(other.state)&&L.roomOf[F.cellAt(other.pos.x,other.pos.z)]===room)return true;return false;}
function enterRest32(c,M,seconds=c.type==='c32_dormant'?C32.restDormant:C32.restRam){
 const d=c.data;c.target=null;c.extra=0;c.path=null;c.dest=null;d.triggerId=null;d.triggerTime=0;d.lost=0;d.hitBy=null;d.hitAt=0;d.direction?.set(0,0,0);d.remaining=0;d.consumed=true;d.restUntil=(M.game.time||0)+seconds;c.setState('rest');
}
function init32(c,M){
 const d=c.data;if(!d.c32){d.c32=true;d.old=new THREE.Vector3();d.last=new THREE.Vector3();d.direction=new THREE.Vector3();d.origin={x:0,y:0,z:0};d.velocity={x:0,y:0,z:0};d.playerOrigin={x:0,y:0,z:0};d.shape=new RAPIER.Capsule(c.def.height/2-c.def.radius,c.def.radius);d.stand=new RAPIER.Capsule(.56,.34);d.crouch=new RAPIER.Capsule(.22,.34);d.crew=crew32(M);d.epoch=0;d.consumed=true;d.triggerTime=0;
  if(offensive(c.state)||c.state==='stunned')enterRest32(c,M,C32.restRam);else c.setState('idle');
 }
 const crew=crew32(M);let joined=false;for(const id of crew)if(!d.crew.has(id)){joined=true;break;}d.crew=crew;
 if(joined&&offensive(c.state)){enterRest32(c,M,C32.restRam);return false;}
 if(suppressed(M.game)){enterRest32(c,M);return false;}
 if(roomBusy32(c,M)){if(offensive(c.state))enterRest32(c,M);else{d.triggerId=null;d.triggerTime=0;}return false;}
 if(d.restUntil>(M.game.time||0)){if(c.state!=='rest')c.setState('rest');return false;}
 if(c.state==='rest'){c.setState('idle');d.restUntil=0;return false;}
 return true;
}
function trigger32(c,p,M){
 const dist=p.pos.distanceTo(c.pos);if(!M.canSee(c,p,8,360))return false;
 return dist<=1.4||(dist<=8&&p.flash&&M.isLookedAt(c,p,8,.85))||(dist<=6&&Math.max(p.noise||0,p.voice||0)>.6);
}
function wake32(c,p){const d=c.data;c.target=p.id;d.epoch++;d.consumed=false;d.triggerId=null;d.triggerTime=0;d.lost=0;d.last.copy(p.pos);c.yaw=Math.atan2(p.pos.x-c.pos.x,p.pos.z-c.pos.z);c.setState('wake');}
function floor32(M,p){const hit=M.game.physics.raycast({x:p.x,y:p.y+.18,z:p.z},{x:0,y:-1,z:0},.38,G.STATIC);return !!hit&&hit.normal.y>.8&&Math.abs(hit.point.y-p.y)<.12;}
function sweep32(c,M,dx,dz){const d=c.data;d.origin.x=c.pos.x;d.origin.y=c.pos.y+c.def.height/2+.04;d.origin.z=c.pos.z;d.velocity.x=dx;d.velocity.y=0;d.velocity.z=dz;return M.game.physics.world.castShape(d.origin,Q,d.velocity,d.shape,.01,1,true,undefined,MASK);}
function moveSwept32(c,goal,dt,speed,M){
 const d=c.data;d.old.copy(c.pos);M.moveToward(c,goal,Math.min(.1,dt),Math.min(6.8,speed));const dx=c.pos.x-d.old.x,dz=c.pos.z-d.old.z;
 if(Math.hypot(dx,dz)<1e-6)return;
 c.pos.copy(d.old);const obstruction=sweep32(c,M,dx,dz);d.last.set(d.old.x+dx,d.old.y,d.old.z+dz);
 if(obstruction||!floor32(M,d.last)){c.path=null;c.dest=null;c.repath=.8;return;}c.pos.copy(d.last);
}
function hitOnce32(c,p,M){
 const d=c.data;if(d.consumed||c.dead||c.stunT>0||M.host.get(c.id)!==c||!eligiblePlayers32(c,M).some(q=>q.id===p.id))return false;
 d.consumed=true;enterRest32(c,M);M.attack(c,p,Math.min(C32.damageCap,c.dmg),c.type,true);return true;
}
function stepDormant32(c,dt,M){
 if(!init32(c,M))return;const d=c.data,players=eligiblePlayers32(c,M),p=players.find(p=>p.id===c.target);
 if(c.state==='wake'){
  c.extra=Math.min(1,c.t/C32.wake);
  if(!p||(!trigger32(c,p,M)&&p.pos.distanceTo(c.pos)>2.5)){enterRest32(c,M);return;}
  if(c.t+1e-6>=C32.wake){if(!trigger32(c,p,M)){enterRest32(c,M);return;}d.chaseAt=M.game.time||0;c.setState('chase');}return;
 }
 if(c.state==='chase'||c.state==='windup'){
  if(!p||c.pos.distanceTo(c.home)>10||(M.game.time||0)-d.chaseAt>=C32.chase){enterRest32(c,M);return;}
  const visible=M.canSee(c,p,16,360);d.lost=visible?0:d.lost+dt;if(d.lost>=1){enterRest32(c,M);return;}
  if(c.state==='windup'){
   c.extra=Math.min(1,c.t/C32.swipe);
   if(!visible||p.pos.distanceTo(c.pos)>1.6){enterRest32(c,M);return;}
   if(c.t+1e-6>=C32.swipe){if(visible&&p.pos.distanceTo(c.pos)<=1.6)hitOnce32(c,p,M);else enterRest32(c,M);}return;
  }
  if(visible&&p.pos.distanceTo(c.pos)<=1.6){c.yaw=Math.atan2(p.pos.x-c.pos.x,p.pos.z-c.pos.z);c.setState('windup');return;}
  if(visible)d.last.copy(p.pos);moveSwept32(c,d.last,dt,3.4,M);return;
 }
 // Native hit marker is consumed once; stun wrapper clears it before recovery.
 const hit=d.hitBy&&players.find(p=>p.id===d.hitBy);if(d.hitBy){d.hitBy=null;if(hit&&(M.game.time||0)-(d.hitAt||0)<=.5&&M.canSee(c,hit,16,360)){wake32(c,hit);return;}}
 let candidate=null;for(const p of players)if(trigger32(c,p,M)&&(!candidate||p.pos.distanceToSquared(c.pos)<candidate.pos.distanceToSquared(c.pos)))candidate=p;
 if(!candidate){d.triggerId=null;d.triggerTime=0;return;}
 if(candidate.pos.distanceTo(c.pos)<=1.4){wake32(c,candidate);return;}
 if(d.triggerId!==candidate.id){d.triggerId=candidate.id;d.triggerTime=0;}d.triggerTime+=dt;if(d.triggerTime+1e-6>=1)wake32(c,candidate);
}
function heldCargo32(M,id){for(const it of M.game.items?.all?.()||[])if(it.state==='held'&&it.holder===id&&!it.inv&&isSellable(it.def))return true;return false;}
function lane32(c,M,direction,length=6,sides=true){
 const d=c.data,nav=M.nav(c);if(!nav||sweep32(c,M,direction.x*length,direction.z*length))return false;
 for(let t=0;t<=length;t+=.4){d.last.set(c.pos.x+direction.x*t,c.pos.y,c.pos.z+direction.z*t);if(!nav.walkableAt(d.last.x,d.last.z)||!floor32(M,d.last))return false;}
 if(sides)for(const side of [-1,1]){const dx=direction.x*4+direction.z*side*1.8,dz=direction.z*4-direction.x*side*1.8;
  d.last.set(c.pos.x+dx,c.pos.y,c.pos.z+dz);if(!nav.walkableAt(d.last.x,d.last.z)||!floor32(M,d.last)||!nav.findPath(c.pos.x,c.pos.z,d.last.x,d.last.z)||sweep32(c,M,dx,dz))return false;
 }return true;
}
function charge32(c,dt,M,players){
 const d=c.data,time=Math.min(dt,C32.ramTime-d.chargeTime),distance=Math.min(C32.ramDistance-d.distance,Math.min(6.8,C32.ramSpeed)*Math.max(0,time));
 if(distance<=1e-5){enterRest32(c,M);return;}
 const dx=d.direction.x*distance,dz=d.direction.z*distance,wall=sweep32(c,M,dx,dz);let obstacle=wall?wall.time_of_impact:1;
 // Continuous floor support is tested before the swept player capsules.
 for(let t=.2;t<=distance+.19;t+=.2){const f=Math.min(t,distance)/distance;d.last.set(c.pos.x+dx*f,c.pos.y,c.pos.z+dz*f);if(!floor32(M,d.last)){obstacle=Math.min(obstacle,Math.max(0,f-.2/distance));break;}}
 let first=null,toi=obstacle;for(const p of players){const half=p.crouch?.22:.56;d.playerOrigin.x=p.pos.x;d.playerOrigin.y=p.pos.y+half+.34+.02;d.playerOrigin.z=p.pos.z;
  const hit=d.shape.castShape(d.origin,Q,d.velocity,p.crouch?d.crouch:d.stand,d.playerOrigin,Q,ZERO,0,1,true);if(hit&&hit.time_of_impact<toi&&M.canSee(c,p,12,360)){toi=hit.time_of_impact;first=p;}
 }
 c.pos.x+=dx*Math.max(0,toi-.001);c.pos.z+=dz*Math.max(0,toi-.001);d.distance+=distance*toi;d.chargeTime+=time;c.extra=d.distance/C32.ramDistance;
 if(first){d.impact=true;if(hitOnce32(c,first,M))M.sound(c,'c32_ram_impact',.55,3);return;}
 if(wall||obstacle<1){enterRest32(c,M);M.sound(c,'c32_ram_impact',.55,3);return;}
 if(d.distance+1e-5>=C32.ramDistance||d.chargeTime+1e-6>=C32.ramTime)enterRest32(c,M);
}
function stepRam32(c,dt,M){
 if(!init32(c,M))return;const d=c.data,players=eligiblePlayers32(c,M),p=players.find(p=>p.id===c.target);
 if(c.state==='windup'){
  c.extra=Math.min(1,c.t/C32.ramWarning);
  if(!p||!M.canSee(c,p,12,360)||!lane32(c,M,d.direction)){enterRest32(c,M);return;}
  if(c.t+1e-6>=C32.ramWarning){d.distance=0;d.chargeTime=0;c.setState('charge');}return;
 }
 if(c.state==='charge'){if(!p){enterRest32(c,M);return;}charge32(c,dt,M,players);return;}
 for(const p of players){const distance=p.pos.distanceTo(c.pos);if(distance<4||distance>10||!M.canSee(c,p,10,360)||!(Math.max(p.noise||0,p.voice||0)>.3||heldCargo32(M,p.id)))continue;
  d.direction.subVectors(p.pos,c.pos).setY(0).normalize();if(!lane32(c,M,d.direction))continue;
  c.target=p.id;d.epoch++;d.consumed=false;d.hitBy=null;c.yaw=Math.atan2(d.direction.x,d.direction.z);c.setState('windup');return;
 }
 d.hitBy=null;
}
function floorKey32(game){const d=game.run?.descent21,F=game.world?.facility;return d&&F?`creatures32:${d.token}:${d.depth}:${F.layout?.seed}`:null;}
function choice32(game){const key=floorKey32(game);if(!key)return null;const rng=new RNG(key);return rng.next()<.25?rng.pick(C32_IDS):null;}
function space32(c,M,p){if(!M.nav(c)?.walkableAt(p.x,p.z)||!floor32(M,p))return false;const d=c.data;d.origin.x=p.x;d.origin.y=p.y+c.def.height/2+.04;d.origin.z=p.z;return !M.game.physics.world.intersectionWithShape(d.origin,Q,d.shape,undefined,MASK);}
function placement32(game,type,pos){
 const M=game.creatures,F=game.world.facility,L=F.layout,def=CREATURES[type],c={pos:pos.clone(),type,zone:'in',def,data:{shape:new RAPIER.Capsule(def.height/2-def.radius,def.radius),origin:{},velocity:{},last:new THREE.Vector3()}};
 if(!Number.isFinite(pos.x)||!Number.isFinite(pos.y)||!Number.isFinite(pos.z)||Math.abs(pos.y-L.y)>.12||!space32(c,M,pos))return null;
 const cell=F.cellAt(pos.x,pos.z),room=L.roomOf[cell];if(room<0||L.rooms[room]?.type==='entrance')return null;
 let exits=0;for(const [key,edge]of L.edgeInfo){if(edge.b<0||edge.locked||F.nav.blockedEdges.has(key))continue;const a=L.roomOf[edge.a],b=L.roomOf[edge.b];if(a!==b&&(a===room||b===room))exits++;}if(exits<2)return null;
 if((F.doors||[]).some(d=>pos.distanceTo(d.pos)<(d.kind==='entrance'?14:3)))return null;
 const plan=game.descent21?.plan?.(),boundary=plan?.boundary;if(boundary&&pos.x>boundary.x0-3&&pos.x<boundary.x1+3&&pos.z>boundary.z0-3&&pos.z<boundary.z1+3)return null;
 if(!F.mainDoor?.spawn||!F.nav.findPath(F.mainDoor.spawn.x,F.mainDoor.spawn.z,pos.x,pos.z))return null;
 if((game.aiPlayers?.()||[]).some(p=>!p.dead&&p.zone==='in'&&p.pos.distanceTo(pos)<=14))return null;
 const early=game.hostEarlySafeFilter?.();if(early&&!early(pos))return null;
 for(const other of M.host.values())if(!other.dead&&offensive(other.state)&&L.roomOf[F.cellAt(other.pos.x,other.pos.z)]===room)return null;
 for(const [dx,dz]of [[0,1],[1,0],[0,-1],[-1,0]]){
  const direction=new THREE.Vector3(dx,0,dz);if(type==='c32_ram'){if(lane32(c,M,direction))return Math.atan2(dx,dz);}
  else{let clear=true;for(const side of [-1,1]){const p=new THREE.Vector3(pos.x+dz*2*side,pos.y,pos.z-dx*2*side);if(!space32(c,M,p)||sweep32(c,M,p.x-pos.x,p.z-pos.z)||!F.nav.findPath(pos.x,pos.z,p.x,p.z)){clear=false;break;}}if(clear)return Math.atan2(dx,dz);}
 }return null;
}
function pickSpot32(game,type){
 const F=game.world.facility,L=F.layout,rng=new RNG(`${floorKey32(game)}:position`),candidates=(F.scrapSpots||[]).filter(p=>!p.elevated).map(p=>new THREE.Vector3(p.x,L.y,p.z));
 for(const room of L.rooms)if(room.type!=='entrance')candidates.push(new THREE.Vector3(L.ox+(room.x+room.w/2)*L.cell,L.y,L.oz+(room.z+room.h/2)*L.cell));
 rng.shuffle(candidates);for(const pos of candidates){const yaw=placement32(game,type,pos);if(yaw!==null)return{pos,yaw};}return null;
}
export function installCreatures32(game){
 if(!registered){registered=true;
  registerCreature('c32_dormant',{name:'Silent Worker',model:'support',hp:90,dmg:18,radius:.4,height:1.65,power:2,maxAlive:1,xp:0,coin:0,walk:0,run:3.4},stepDormant32);
  registerCreature('c32_ram',{name:'Lane Breaker',model:'support',hp:160,dmg:22,radius:.5,height:1.9,power:2,maxAlive:1,xp:0,coin:0,walk:1.3,run:6.5},stepRam32);
 }
 const M=game.creatures,previousDamage=M.damage;
 const damage=function(id,amount,by,opts={}){const c=this.host.get(id);const stun=owned(c?.type)&&opts.stun>0;const result=previousDamage.call(this,id,amount,by,opts);if(stun&&!c.dead){init32(c,this);enterRest32(c,this,(c.stunT||0)+(c.type==='c32_dormant'?C32.restDormant:C32.restRam));}return result;};M.damage=damage;
 let disposed=false,arrivalFac=game.world?.facility||null,arrivalAt=Number(game.time)||0;const inFlightFloors=new Set(),offs=[];
 const on=(name,fn)=>{const off=game.mods?.on?.(name,fn);if(off)offs.push(off);};
 const resetArrival=()=>{arrivalFac=game.world?.facility||null;arrivalAt=Number(game.time)||0;};
 on('mapLoaded',resetArrival);on('facilityChanged',resetArrival);on('facilityWillChange',()=>{arrivalFac=null;arrivalAt=Number(game.time)||0;});
 on('hostMigrated',(g,info)=>{resetArrival();if(g===game&&info?.self)for(const c of M.host.values())if(owned(c.type)&&!c.dead){init32(c,M);enterRest32(c,M,C32.restRam);}});
 function receipts(){if(!Array.isArray(game.run?.creatures32SeenFloors)){if(game.run)game.run.creatures32SeenFloors=Object.freeze([]);}return game.run?.creatures32SeenFloors||[];}
 receipts();on('hostStart',receipts);
 function admit32(type,pos=null){
  const run=game.run,d=run?.descent21,F=game.world?.facility,key=floorKey32(game),moon=MOONS[run?.moon];
  if(disposed||!game.isHost||game.config?.creatures32!==true||run?.phase!=='moon'||!F||!d||d.token!==descentToken(run)||d.depth<3||(run.quotaIndex|0)<2||!['factory','office'].includes(F.layout?.theme)||moon?.company||moon?.home||game.world?.company||suppressed(game))return false;
  if(arrivalFac!==F){arrivalFac=F;arrivalAt=Number(game.time)||0;}if((Number(game.time)||0)-arrivalAt<25)return false;
  const seen=receipts();if(!key||seen.length>=128||seen.includes(key)||inFlightFloors.has(key)||choice32(game)!==type)return false;
  if([...M.host.values()].some(c=>owned(c.type)&&!c.dead)||!canSpawnMore(type,M.host)||game.descentThreat21?.allow?.(type)===false)return false;
  if((game.hostData?.powerUsed||0)+(CREATURES[type]?.power||0)>(game.indoorBudget?.()??0)+.001)return false;
  if(game.crdirector?.canSpawn?.(type,pos)===false)return false;
  return true;
 }
 const previousSpawn=M.hostSpawn;
 const hostSpawn=function(type,pos,opts={}){
  if(!owned(type))return previousSpawn.call(this,type,pos,opts);
  if(opts.id){const view=this.views.get(opts.id);if(!view||view.type!==type||this.host.has(opts.id)||view.state==='dead'||disposed||!game.isHost)return null;
   const c=previousSpawn.call(this,type,pos,{...opts,state:'rest',extra:0,data:undefined,elite:false,variant:null,affix:null,tier:null,fa:null});if(c){c.hp=Math.min(c.maxHp,view.hp??c.hp);init32(c,this);enterRest32(c,this,C32.restRam);}return c;
  }
  if(opts.zone&&opts.zone!=='in'||!admit32(type,pos))return null;const yaw=placement32(game,type,pos);if(yaw===null)return null;
  const key=floorKey32(game),before=new Set(this.host.keys()),receiptRun=game.run;let spawned=null;inFlightFloors.add(key);receiptRun.creatures32SeenFloors=Object.freeze([...receipts(),key]);
  try{game.broadcastRun?.(['creatures32SeenFloors']);spawned=previousSpawn.call(this,type,pos,{...opts,zone:'in',state:'idle',extra:0,data:undefined,elite:false,variant:null,affix:null,tier:null,fa:null,yaw,seed:new RNG(`${key}:actor`).int(1,99999)});return spawned;}
  finally{const added=!!spawned||[...this.host.values()].some(c=>!before.has(c.id)&&c.type===type);try{if(!added){receiptRun.creatures32SeenFloors=Object.freeze(receiptRun.creatures32SeenFloors.filter(k=>k!==key));if(game.run===receiptRun)game.broadcastRun?.(['creatures32SeenFloors']);}}finally{inFlightFloors.delete(key);}}
 };M.hostSpawn=hostSpawn;
 const previousIndoor=game.hostSpawnCreatureIndoor;
 const indoor=function(type){if(!owned(type))return previousIndoor?.call(this,type);const chosen=choice32(game);if(!chosen||!admit32(chosen))return false;const spot=pickSpot32(game,chosen);if(!spot)return false;const level=Math.max(1,creatureBaseLevel(MOONS[game.run.moon]?.tier||1,game.run.quotaIndex)+new RNG(`${floorKey32(game)}:level`).int(-1,2));return !!M.hostSpawn(chosen,spot.pos,{zone:'in',level,yaw:spot.yaw});};game.hostSpawnCreatureIndoor=indoor;
 return{ids:C32_IDS,choice:()=>choice32(game),dispose(){if(disposed)return;disposed=true;for(const off of offs)off();inFlightFloors.clear();arrivalFac=null;if(M.damage===damage)M.damage=previousDamage;if(M.hostSpawn===hostSpawn)M.hostSpawn=previousSpawn;if(game.hostSpawnCreatureIndoor===indoor)game.hostSpawnCreatureIndoor=previousIndoor;}};
}
