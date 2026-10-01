// Mode-only native actors and host-simulated card trajectories. No campaign rewards.
import * as THREE from 'three';
import {registerCreature,CREATURES} from './creatures.js';
import {createCreatureModel} from '../models/creatures.js';
import {createCardMesh} from '../models/weapons_wave1.js';
import {RAPIER,G,groups} from '../physics/physics.js';
export const DL24_TYPES=['dl24_clerk','dl24_sorter','dl24_auditor','dl24_warden'];
const BASES=['scuttler','screamer','crawler','moderator'];
const alive=M=>M.game.aiPlayers().filter(p=>!p.dead&&!p.downed&&!M.game.downed?.isDowned?.(p.id)&&p.zone==='in');
function step(c,p,dt,M){const old=c.pos.clone();M.moveToward(c,p.pos,Math.min(.06,dt),c.def.run);const v=c.pos.clone().sub(old);if(v.lengthSq()<1e-8)return;
 c.data.shape ||=new RAPIER.Capsule(Math.max(.01,c.def.height/2-c.def.radius),c.def.radius);
 const physics=M.game.physics,origin={x:old.x,y:old.y+c.def.height/2+.02,z:old.z},rotation={x:0,y:0,z:0,w:1},filter=groups(0xffff,G.STATIC|G.DOOR);
 const hit=physics.world.castShape(origin,rotation,{x:v.x,y:0,z:v.z},c.data.shape,.005,1,true,undefined,filter);if(hit){
  c.pos.copy(old);
  // Grid-smoothed paths can skim a divider. Retain only fully swept tangential
  // movement, with at most two additional casts and the complete native body.
  const axes=Math.abs(v.x)>Math.abs(v.z)?[{x:v.x,z:0},{x:0,z:v.z}]:[{x:0,z:v.z},{x:v.x,z:0}];
  for(const a of axes){if(Math.hypot(a.x,a.z)<1e-7)continue;const n=hit.normal1,norm=Math.hypot(n?.x||0,n?.z||0);if(norm>1e-6){a.x+=n.x/norm*.002;a.z+=n.z/norm*.002;const length=Math.hypot(a.x,a.z),budget=Math.hypot(v.x,v.z);if(length>budget){a.x*=budget/length;a.z*=budget/length;}}if(physics.world.castShape(origin,rotation,{x:a.x,y:0,z:a.z},c.data.shape,.005,1,true,undefined,filter))continue;
   const q=old.clone().add(new THREE.Vector3(a.x,0,a.z)),floor=physics.raycast(q.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),1.2,G.STATIC|G.DOOR);
   if(!floor||floor.normal.y<.7||Math.abs(floor.point.y-old.y)>.08)continue;if(physics.world.intersectionWithShape({x:q.x,y:q.y+c.def.height/2+.02,z:q.z},rotation,c.data.shape,undefined,filter))continue;c.pos.copy(q);return;}
  c.path=null;c.repath=.6;
 }}
function actorAI(c,dt,M){if(!M.game.deadletter24?.active?.())return;const ps=alive(M),p=ps.find(p=>p.id===c.target)||ps.sort((a,b)=>a.pos.distanceToSquared(c.pos)-b.pos.distanceToSquared(c.pos))[0];
 if(!p){c.target=null;c.setState('idle');return;}c.target=p.id;
 if(c.state==='warning'){if(c.t>=1.3)c.setState('run');return;}
 if(c.state==='rest'){if(c.t>=1.1)c.setState('run');return;}
 if(c.state==='windup'){
  const duration=c.def.boss?1.45:1.05;c.extra=Math.min(1,c.t/duration);
  if(c.t>=duration){const range=c.def.boss?3.25:1.8;for(const q of (c.def.boss?ps:[p]))if(q.pos.distanceTo(c.pos)<range&&M.canSee(c,q,range+.2,360))M.attack(c,q,c.dmg,c.type,true);c.extra=0;c.setState('rest');}return;
 }
 if(c.state==='attack'){c.setState('rest');return;}
 if(p.pos.distanceTo(c.pos)<(c.def.boss?3.1:1.6)&&M.canSee(c,p,4,360)){c.extra=0;c.setState('windup');return;}
 M.openDoorsNear(c);step(c,p,dt,M);
}
let registered=false;
export function registerDeadletter24Actors(game){if(!registered){registered=true;
 const defs=[['Unsent Clerk',36,9,3.0,.35,.7],['Null Sorter',65,13,2.7,.4,1.9],['Filing Auditor',95,18,2.5,.55,1.2],['Return Warden',420,24,2.1,.55,2.1]];
 defs.forEach(([name,hp,dmg,run,radius,height],i)=>registerCreature(DL24_TYPES[i],{name,hp,dmg,walk:run*.6,run,radius,height,zone:'in',power:1,xp:0,coin:0,noSpawn:true,noScan:true,noIdentify:true,boss:i===3,lore:'Raised arms and an amber circle warn before impact. Retreat around a sorting wall.'},actorAI));}
 const registry=(typeof window!=='undefined'?window.__kefalMods?.creatureModels:null)||game.mods?.creatureModels;
 const ownership=[];DL24_TYPES.forEach((id,i)=>{const previous=registry?.get(id);const factory=(_THREE,opts)=>{const m=createCreatureModel(BASES[i],opts);const ring=new THREE.Mesh(new THREE.RingGeometry(.65,i===3?3.25:1.8,24),new THREE.MeshBasicMaterial({color:0xb88947,transparent:true,opacity:.32,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.045;ring.visible=false;m.root.add(ring);const update=m.update.bind(m),dispose=m.dispose.bind(m);let gone=false;m.update=(dt,a)=>{ring.visible=a.state==='windup';update(dt,{...a,state:a.state==='windup'?'attack':a.state==='warning'?'idle':a.state});};m.dispose=()=>{if(gone)return;gone=true;ring.geometry.dispose();ring.material.dispose();dispose();};return m;};registry?.set(id,factory);ownership.push({id,previous,factory});});return()=>{for(const {id,previous,factory}of ownership)if(registry?.get(id)===factory){if(previous)registry.set(id,previous);else registry.delete(id);}};
}
export function createDeadletter24Projectiles(game,{ownsCreature,damage,send}){
 const live=new Map();let next=0;
 function remove(id,broadcast=false){const p=live.get(id);if(!p)return;p.mesh?.removeFromParent();p.mesh?.userData?.dispose?.();live.delete(id);if(broadcast)send({op:'rm',id});}
 function event(d){if(d.op==='rm'){remove(d.id);return;}if(d.op!=='sp'||live.has(d.id)||live.size>=96)return;
  const mesh=createCardMesh(d.kind==='return'?'blue':d.kind==='bounce'?'gold':d.kind==='slow'?'red':'std');mesh.rotation.x=-Math.PI/2;game.scene?.add(mesh);
  live.set(d.id,{...d,pos:new THREE.Vector3().fromArray(d.p),vel:new THREE.Vector3().fromArray(d.v),life:0,hits:new Set(),totalHits:new Map(),leg:0,remaining:(d.pierce||0)+(d.kind==='return'?1:0),bounces:d.kind==='bounce'?2:0,mesh});}
 function fire({origin,direction,owner,kind='std',power=1,pierce=0,range=1,crit=0,critDamage=1.5,returnRank=0}){if(live.size>=96)return false;
  const d={op:'sp',id:`dlp${++next}`,p:origin.toArray(),v:direction.clone().multiplyScalar(26).toArray(),owner,kind,power,pierce:Math.min(5,pierce),range:Math.min(1.4,range),crit,critDamage,returnRank};send(d);if(!live.has(d.id))event(d);return true;}
 function update(dt){dt=Math.min(.08,dt);for(const p of [...live.values()]){p.life+=dt;const duration=1.15*p.range;
  if(p.life>duration*(p.kind==='return'?2+Math.min(5,p.returnRank||0):1)){remove(p.id,game.isHost);continue;}
  if(p.kind==='return'&&Math.floor(p.life/duration)>p.leg){p.leg=Math.floor(p.life/duration);p.vel.multiplyScalar(-1);p.hits.clear();p.remaining=(p.pierce||0)+1;}
  const delta=p.vel.clone().multiplyScalar(dt),len=delta.length(),dir=delta.clone().normalize(),wall=game.physics.raycast(p.pos,dir,len,G.STATIC|G.DOOR);let travelled=wall?wall.distance:len;
  if(game.isHost){const candidates=[];for(const c of game.creatures.host.values()){if(c.dead||!ownsCreature(c)||p.hits.has(c.id)||(p.totalHits.get(c.id)||0)>=2)continue;const center=c.pos.clone().add(new THREE.Vector3(0,c.def.height*.5,0)),offset=center.sub(p.pos),along=offset.dot(dir);if(along<-.1||along>travelled+.15)continue;const rad=Math.max(.45,c.def.radius||.4);if(offset.lengthSq()-along*along<rad*rad+c.def.height*c.def.height*.1&&game.physics.lineOfSight(p.pos,c.pos.clone().add(new THREE.Vector3(0,c.def.height*.5,0)),G.STATIC|G.DOOR))candidates.push({c,t:Math.max(0,along)});}
   candidates.sort((a,b)=>a.t-b.t);for(const {c,t}of candidates){p.hits.add(c.id);p.totalHits.set(c.id,(p.totalHits.get(c.id)||0)+1);damage(c,p);if(p.remaining--<=0){travelled=t;remove(p.id,true);break;}}
  }
  if(!live.has(p.id))continue;p.pos.addScaledVector(dir,travelled);
  if(wall){if(p.bounces-->0){p.vel.reflect(wall.normal);p.pos.addScaledVector(wall.normal,.04);}else{remove(p.id,game.isHost);continue;}}
  if(p.mesh){p.mesh.position.copy(p.pos);p.mesh.rotation.z+=dt*20;}
 }}
 return{fire,event,update,clear(){for(const id of [...live.keys()])remove(id);},count:()=>live.size};
}
