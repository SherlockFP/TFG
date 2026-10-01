import * as THREE from 'three';
import {descentToken} from './descent21_state.js';

// Null Reception stores an obsolete acoustic receipt, rather than tracking the
// crew's current position. Native hearing/occlusion consumes the replay normally.
export const LIMINAL26=Object.freeze({delay:3,cooldown:8,maxPending:8,minLoud:.6,replayLoud:1.1});
export function installLiminal26(game){
 const offs=[],pending=[],cooldowns=new Map();
 const manager=game.creatures,originalNoise=manager?.noise;
 let disposed=false,facility=null,suspended=false,role=!!game.isHost,epoch=game.net?.hostEpoch;
 const active=()=>!disposed&&!suspended&&game.isHost&&game.run?.phase==='moon'&&game.world?.facility?.layout?.theme==='nullreception'&&game.run?.descent21?.depth>0&&game.run.descent21.token===descentToken(game.run);
 const now=()=>Number(game.time)||0;
 function clear(){pending.length=0;cooldowns.clear();if(manager?.noises)manager.noises=manager.noises.filter(n=>!n.liminal26);}
 function sync(){
  if(role!==!!game.isHost||epoch!==game.net?.hostEpoch){clear();role=!!game.isHost;epoch=game.net?.hostEpoch;}
  if(facility!==game.world?.facility){clear();facility=game.world?.facility||null;}
  if(!active()){if(pending.length||cooldowns.size)clear();return false;}return true;
 }
 const crew=()=>[...(game.aiPlayers?.()||[])].filter(p=>!p.dead&&!p.inShip&&p.zone==='in'&&!game.downed?.isDowned?.(p.id)&&facility?.contains?.(p.pos));
 function capture(pos,loud,owner){
  if(!sync()||!pos||![pos.x,pos.y,pos.z,loud].every(Number.isFinite)||loud<LIMINAL26.minLoud||!facility.contains(pos))return false;
  // Legacy native tool/door events have no owner. They are admitted only near a
  // living crew member. Distant noise and explicitly creature-owned calls are
  // not stored; an ownerless sound near crew can also be a local world impact.
  for(const [id,until]of cooldowns)if(until<=now())cooldowns.delete(id);
  const players=crew(),p=owner?players.find(p=>p.id===owner):players.find(p=>p.pos.distanceTo(pos)<=8);
  if(!p||p.pos.distanceTo(pos)>8||pending.length>=LIMINAL26.maxPending||now()<(cooldowns.get(p.id)??-Infinity))return false;
  cooldowns.set(p.id,now()+LIMINAL26.cooldown);
  pending.push({at:now()+LIMINAL26.delay,pos:new THREE.Vector3(pos.x,pos.y,pos.z)});
  return true;
 }
 const wrappedNoise=typeof originalNoise==='function'?function(pos,loud,owner=null){const result=originalNoise.call(this,pos,loud,owner);capture(pos,loud,owner);return result;}:null;
 if(wrappedNoise)manager.noise=wrappedNoise;
 const on=(name,fn)=>{const off=game.mods?.on?.(name,fn);if(off)offs.push(off);};
 on('facilityWillChange',()=>{suspended=true;clear();facility=null;});
 on('facilityChanged',()=>{suspended=false;sync();});
 on('mapLoaded',()=>{suspended=false;sync();});
 on('phase',()=>{clear();suspended=false;facility=null;});
 on('hostMigrated',()=>{clear();role=!!game.isHost;epoch=game.net?.hostEpoch;});
 on('update',(dt,g)=>{
  if(g&&g!==game||!sync())return;
  // Continuous native footsteps/voice are represented by aiPlayers rather than
  // calls to noise(). One receipt per crew member also bounds sustained sprinting.
  for(const p of crew())capture(p.pos,Math.max(Number(p.noise)||0,(Number(p.voice)||0)*1.5),p.id);
  const due=pending.findIndex(e=>e.at<=now());if(due<0)return;
  const echo=pending.splice(due,1)[0];
  // A reflection is not a second player action: no recursive capture and no
  // second balance.onNoise pressure charge. This is the native hearing row shape.
  manager.noises.push({pos:echo.pos,loud:LIMINAL26.replayLoud,t:0,owner:null,zone:'in',liminal26:true});
  game.net?.broadcast?.('fx',{k:'snd',s:'walkie_static',p:[echo.pos.x,echo.pos.y+.3,echo.pos.z],v:.48,r:3,m:30,pt:.72});
 });
 sync();
 return{active,stats:()=>({pending:pending.length,cooldowns:cooldowns.size}),dispose(){if(disposed)return;disposed=true;clear();for(const off of offs)off();if(manager?.noise===wrappedNoise)manager.noise=originalNoise;facility=null;}};
}
