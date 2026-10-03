import * as THREE from 'three';
import {RNG} from '../core/rng.js';
import {sysMsg} from '../core/i18n.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {SHIP,insideShip} from '../world/ship.js';
import {CREATURES} from './creatures.js';
import {registerWave1Content} from './creatures_wave1.js';

const TYPES=new Set(['zombot','spider']),INTERVAL=75,WARNING=6;
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const mapKey=g=>`${g.run?.moon}:${g.run?.seed}:${g.run?.day}`;
const cap=w=>Math.min(32,12+4*Math.floor(Math.max(0,w-1)/4));
const count=w=>Math.min(cap(w),2*w);
function receipt(r){return !!r&&typeof r.token==='string'&&r.token.length>0&&r.token.length<=160&&typeof r.map==='string'&&r.map.length<=160&&Number.isSafeInteger(r.wave)&&r.wave>0&&r.wave<=100000&&Number.isInteger(r.index)&&r.index>=0&&r.index<32&&typeof r.elite==='boolean';}

// One host director clock. Native CreatureManager owns actor age, stun, movement,
// attacks, snapshots and death cleanup; this module schedules no second clock.
export function installEndless41Waves(game){
 registerWave1Content();
 let disposed=false,searchAfter=0,searchMap='';const issued=new Set(),offs=[];
 const state=()=>game.run?.endless41;
 const active=()=>!disposed&&!!game.endless41?.active?.()&&!!state();
 const field=()=>active()&&game.isHost&&game.run?.phase==='moon'&&['field','break'].includes(state().stage)&&game.world?.moonId===game.run.moon&&game.world?.seed===game.run.seed&&!!game.world?.terrain;
 const bodies=()=> (game.aiPlayers?.()||[]).filter(p=>!p.dead&&p.pos&&[p.pos.x,p.pos.y,p.pos.z].every(Number.isFinite));
 const living=()=>bodies().filter(p=>!p.downed&&!game.downed?.isDowned?.(p.id));
 const connected=id=>id===game.selfId||!!game.net?.players?.has(id)&&!game.net?.lost?.has(id);
 const publish=()=>game.broadcastRun?.(['endless41']);
 const doorway=()=>new THREE.Vector3(SHIP.door.x,game.world?.terrain?.heightAt(SHIP.door.x,SHIP.z1+3.5)??-1.25,SHIP.z1+3.5);
 const anchor=()=>living().filter(p=>p.zone==='out'&&!p.inShip&&!p.downed&&connected(p.id)).sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0]?.pos||doorway();
 function owns(c){const r=c?.data?.e41,s=state();return active()&&TYPES.has(c?.type)&&receipt(r)&&r.token===s.token&&r.map===mapKey(game)&&r.wave<=s.wave;}
 function floorAt(x,z,type,approach=false){
  const terrain=game.world?.terrain,physics=game.physics,def=CREATURES[type];
  if(!terrain||!def||!physics?.world||!Number.isFinite(x)||!Number.isFinite(z))return null;
  const limit=Math.min(finite(terrain.playHalf,120),finite(terrain.half,120))-3,radius=def.radius;
  if(Math.abs(x)>limit||Math.abs(z)>limit||terrain.blocked?.(x,z,radius))return null;
  const ground=terrain.heightAt(x,z);
  if(!Number.isFinite(ground)||terrain.lava&&terrain.lavaDepthAt(x,z)>-.15||terrain.biome?.acid&&terrain.flood!=null&&ground<terrain.flood+.15)return null;
  const hit=physics.raycast({x,y:ground+4,z},{x:0,y:-1,z:0},6,G.STATIC|G.DOOR);
  if(!hit||hit.normal?.y<.7)return null;
  const y=hit.point.y+.03,p=new THREE.Vector3(x,y,z);
  const front=approach&&Math.abs(x-SHIP.door.x)<1.25&&z>SHIP.z1+.5&&z<SHIP.z1+6;
  if(insideShip(p)||Math.abs(y-ground)>(front?1.5:.45))return null;
  const half=Math.max(.05,def.height/2-radius),shape=new RAPIER.Capsule(half,radius);
  if(physics.world.intersectionWithShape({x,y:y+half+radius+.04,z},{x:0,y:0,z:0,w:1},shape,undefined,groups(0xffff,G.STATIC|G.DOOR|G.BIG)))return null;
  return p;
 }
 function spawnSafe(p,type){return flat(p,{x:0,z:0})>=18&&bodies().every(q=>flat(p,q.pos)>=20)&&![...game.creatures.host.values()].some(c=>!c.dead&&flat(p,c.pos)<1.3+(c.def?.radius||.4))&&!!floorAt(p.x,p.z,type);}
 function corridor(a,b,type){
  const n=Math.ceil(flat(a,b)/2.5);let prev=a;
  for(let i=1;i<=n;i++){
   const p=floorAt(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,type,true);
   if(!p||Math.abs(p.y-prev.y)>Math.max(.42,flat(p,prev)*.65)||!game.physics.lineOfSight(prev.clone().add(new THREE.Vector3(0,.9,0)),p.clone().add(new THREE.Vector3(0,.9,0)),G.STATIC|G.DOOR|G.BIG))return false;
   prev=p;
  }
  return true;
 }
 function safeSpot(wave,index,angle,type){
  const s=state(),a=anchor(),rng=new RNG(`${s.token}:${mapKey(game)}:${wave}:${index}:${angle}`);
  for(let i=0;i<24;i++){
   const az=angle+rng.float(-.6,.6),radius=rng.float(30,43),p=floorAt(a.x+Math.sin(az)*radius,a.z+Math.cos(az)*radius,type);
   if(p&&spawnSafe(p,type)&&corridor(p,a,type))return p;
  }
  return null;
 }
 function warning(wave){
  const s=state(),rng=new RNG(`${s.token}:${mapKey(game)}:region:${wave}`),angles=rng.shuffle([0,Math.PI/2,Math.PI,3*Math.PI/2]);
  const angle=angles.find(a=>safeSpot(wave,0,a,'zombot'));
  if(angle===undefined)return false;
  const region=['South','East','North','West'][Math.round(angle/(Math.PI/2))%4];
  s.waveWarning={token:s.token,map:mapKey(game),wave,region,angle,at:s.elapsed,due:s.elapsed+WARNING,count:count(wave),spawned:0,nextSpawn:s.elapsed+WARNING};
  s.stage='field';game.net.broadcast('sys',sysMsg('Wave {n} approaches from the {@r} in {s} s.',{n:wave,r:region,s:WARNING},'warn'));publish();return true;
 }
 function restore(type,pos,opts){
  if(!opts.id||game.creatures.host.has(opts.id))return null;
  const v=game.creatures.views.get(opts.id),r=v?.spawnData?.e41,s=state();
  if(v?.type!==type||v.state==='dead'||v.hp<=0||!receipt(r)||r.token!==s.token||r.map!==mapKey(game)||r.wave>s.wave)return null;
  const at=v.target||v.pos,ground=floorAt(pos.x,pos.z,type,true);
  if(!at||!ground||at.distanceTo(pos)>.2||Math.abs(ground.y-pos.y)>.2)return null;
  return {token:r.token,map:r.map,wave:r.wave,index:r.index,elite:r.elite};
 }
 function spawnOptions(type,pos,opts={}){
  if(!field()||!TYPES.has(type))return false;
  const s=state(),r=opts.id?restore(type,pos,opts):opts.data?.e41;
  if(!r)return false;
  if(!opts.id&&(!issued.has(r)||s.elapsed<Math.max(90,finite(s.grace,90))||s.waveWarning?.wave!==r.wave||s.elapsed<s.waveWarning.due||r.index!==s.waveWarning.spawned||!spawnSafe(pos,type)))return false;
  if(!opts.id&&[...game.creatures.host.values()].filter(c=>owns(c)&&!c.dead).length>=cap(r.wave))return false;
  const rng=new RNG(`${r.token}:${r.map}:${r.wave}:${r.index}:actor`);
  return {...opts,zone:'out',level:1,variant:type==='spider'?'hunter':null,affix:null,tier:null,fa:null,elite:r.elite,yaw:rng.float(0,Math.PI*2),seed:rng.int(1,999999),data:{...opts.data,e41:r,grouped:true,wave:r.wave}};
 }
 function afterSpawn(c,opts){
  const r=opts.data?.e41;if(!receipt(r)||r.token!==state()?.token||r.map!==mapKey(game))return;
  issued.delete(r);const wave=r.wave,total=Math.max(wave,finite(state().totalWaves,wave));
  const speed=Math.min(2.3,1.1+.06*(wave-1)),hp=Math.min(100,28+3*(wave-1)+Math.min(12,Math.floor(total/4)))*(r.elite?1.7:1);
  c.def={...c.def,walk:speed,run:speed};c.hp=c.maxHp=Math.round(hp);c.dmg=Math.min(18,6+Math.floor(wave/3))*(r.elite?1.3:1);c.xp=c.coin=0;c.data.e41=r;
 }
 function onKill(c,by){
  if(!field()||!owns(c)||game.creatures.host.get(c.id)!==c||c.data.e41Rewarded)return;
  c.data.e41Rewarded=true;const s=state();s.kills=finite(s.kills)+1;
  const amount=c.data.e41.elite?30:18,awarded=new Set();
  if(by==='sytur')by=connected(s.turretOwner)&&living().some(p=>p.id===s.turretOwner)?s.turretOwner:null;
  if(connected(by)&&s.players?.[by]){game.endless41.awardXp?.(by,amount);awarded.add(by);}
  for(const id of c.attackers.keys())if(!awarded.has(id)&&connected(id)&&s.players?.[id]){game.endless41.awardXp?.(id,Math.ceil(amount/2));awarded.add(id);}
  publish();
 }
 function canMove(c,x,z){
  if(!field()||!owns(c))return false;
  const p=floorAt(x,z,c.type,true);if(!p||Math.abs(p.y-c.pos.y)>Math.max(.42,flat(p,c.pos)*.65))return false;
  if(!game.physics.lineOfSight(c.pos.clone().add(new THREE.Vector3(0,.9,0)),p.clone().add(new THREE.Vector3(0,.9,0)),G.STATIC|G.DOOR|G.BIG))return false;
  return {y:p.y};
 }
 function creatureTick(c,dt,M){
  if(!owns(c))return false;
  if(!field()||state().elapsed<Math.max(90,finite(state().grace,90))||!Number.isFinite(dt)||dt<=0)return true;
  dt=Math.min(dt,.25);const s=state(),ps=living().filter(p=>p.zone==='out'&&!p.inShip&&!p.downed&&connected(p.id));
  const target=M.nearest(c,ps,65)?.p,door=doorway(),goal=target?.pos||door,shipDoor=new THREE.Vector3(SHIP.door.x,.7,SHIP.z1+.55);
  const reach=target?1.5:3.5,near=target?flat(c.pos,goal)<=reach&&Math.abs(c.pos.y-goal.y)<2:c.pos.distanceTo(shipDoor)<=reach;
  const from=c.pos.clone().add(new THREE.Vector3(0,.9,0)),to=target?.eye||shipDoor;
  if(near&&game.physics.lineOfSight(from,to,G.STATIC|G.DOOR|G.BIG)){
   const key=target?.id||'ship';
   if(c.data.e41Attack!==key){c.data.e41Attack=key;c.data.e41Windup=s.elapsed+.45;c.setState('attack');}
   if(s.elapsed>=c.data.e41Windup&&c.cooldown<=0&&c.age>=1){
    if(target){M.attack(c,target,c.dmg,c.type);c.cooldown=1.5;}
    else if(s.elapsed>=finite(s.shipHitAt,-99)+1){s.shipHp=Math.max(0,finite(s.shipHp,300)-Math.min(12,c.dmg));s.shipHitAt=s.elapsed;c.cooldown=3;publish();}
   }
  }else{delete c.data.e41Attack;delete c.data.e41Windup;c.setState('run');M.moveToward(c,goal,dt,c.def.run);}
  return true;
 }
 function tick(dt){
  if(!field()||!Number.isFinite(dt)||dt<=0)return;
  const s=state();s.elapsed=Math.max(0,finite(s.elapsed))+Math.min(dt,.25);
  const key=`${s.token}:${mapKey(game)}:${s.trip||0}`;if(searchMap!==key||searchAfter>s.elapsed+2){searchMap=key;searchAfter=0;}
  if(s.waveWarning&&(s.waveWarning.token!==s.token||s.waveWarning.map!==mapKey(game)))s.waveWarning=null;
  const grace=Math.max(90,finite(s.grace,90)),next=grace+Math.max(0,finite(s.wave))*INTERVAL;
  if(!s.waveWarning&&s.elapsed>=next&&s.wave<100000&&s.elapsed>=searchAfter){searchAfter=s.elapsed+2;warning(s.wave+1);}
  const w=s.waveWarning;
  if(w&&s.elapsed>=w.due){
   if(s.wave<w.wave){s.wave=w.wave;s.totalWaves=Math.max(0,finite(s.totalWaves))+1;publish();}
   if(w.spawned<w.count&&s.elapsed>=w.nextSpawn&&[...game.creatures.host.values()].filter(c=>owns(c)&&!c.dead).length<cap(w.wave)){
    w.nextSpawn=s.elapsed+1.2;const index=w.spawned,type=w.wave>=4&&index%4===3?'spider':'zombot',p=safeSpot(w.wave,index,w.angle,type);
    if(p){const r={token:s.token,map:mapKey(game),wave:w.wave,index,elite:w.wave%4===0&&index===0};issued.add(r);
     try{const c=game.creatures.hostSpawn(type,p,{data:{e41:r}});if(c)w.spawned++;}finally{issued.delete(r);}}
   }
   if(w.spawned>=w.count){s.waveWarning=null;publish();}
  }
  if(!s.waveWarning&&s.wave>0&&!Array.from(game.creatures.host.values()).some(c=>owns(c)&&!c.dead)&&s.stage!=='break'){s.stage='break';publish();}
 }
 const on=(event,fn)=>{const off=game.mods?.on?.(event,fn);if(off)offs.push(off);};
 on('mapLoaded',(_,g)=>{if(g===game){issued.clear();searchAfter=0;searchMap='';if(game.isHost)for(const c of [...game.creatures.host.values()])if(c.data?.e41&&!owns(c))game.creatures.hostRemove(c.id);}});
 on('hostMigrated',g=>{if(g!==game)return;issued.clear();searchAfter=0;searchMap='';if(!field())return;
  const s=state(),w=s.waveWarning;if(!w||w.token!==s.token||w.map!==mapKey(game))return;
  const received=[...game.creatures.host.values()].filter(c=>owns(c)&&c.data.e41.wave===w.wave).map(c=>c.data.e41.index+1);
  const spawned=Math.min(w.count,Math.max(finite(w.spawned),...received));
  if(spawned>w.spawned){w.spawned=spawned;publish();}
 });
 return {tick,owns,spawnOptions,afterSpawn,onKill,canMove,creatureTick,dispose(){if(disposed)return;disposed=true;issued.clear();offs.forEach(off=>off());}};
}
