// A short manual shove for loose heavy salvage; native Rapier and item replication retain authority.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { wrapMethod } from './dailyEvents.js';
import { looseCargo, impulseCargo, approachingCargo, brakeCargo, cargoToken } from './cargo20_core.js';
import { nudgeLabel } from './cargo20_text.js';
export function installCargo20(game) {
 const offs=[],seen=new Map(),peerAt=new Map(),bodyAt=new Map(),bursts=new Map();let disposed=false,nonce=0;
 const active=()=>!disposed&&!game.destroyed&&!!game.run&&['moon','company','orbit'].includes(game.run.phase)&&(game.run.phase==='orbit'||game.world?.moonId===game.run.moon);
 function freeHands(from){return ![...(game.items?.all?.()||[])].some(it=>it.owner===from||(it.holder===from&&!it.inv&&(it.type==='body'||it.def?.hands===2)));}
 function eligible(it){return looseCargo(it)&&it.def?.kind==='big';}
 function reachable(from,it){
  const p=game.aiPlayerById?.(from);
  if(!p||p.dead||game.downed?.isDowned?.(from)||!p.pos||!p.look||!eligible(it)||!freeHands(from))return null;
  const pos=it.body.translation(),eye=p.eye||new THREE.Vector3(p.pos.x,p.pos.y+1.5,p.pos.z);
  if(Math.hypot(pos.x-p.pos.x,pos.y-p.pos.y,pos.z-p.pos.z)>2.8)return null;
  const dir=new THREE.Vector3(pos.x-eye.x,pos.y-eye.y,pos.z-eye.z),distance=dir.length();
  if(distance>.1){dir.divideScalar(distance);if(dir.dot(p.look)<.35)return null;if(game.physics.raycast(eye,dir,Math.max(0,distance-.1),G.STATIC|G.DOOR))return null;}
  return p;
 }
 function hostNudge(d,from){
  if(!game.isHost||!active()||!d||d.token!==cargoToken(game.run)||!Number.isSafeInteger(d.n)||d.n<1||d.n>1e9)return false;
  const brake=d.op==='brake';if(d.op!==undefined&&d.op!=='push'&&!brake)return false;
  const it=game.items?.get?.(d.id),time=game.time||0,p=reachable(from,it);
  if(!p||(!brake&&bursts.has(it.id))||d.n<=(seen.get(from)||0)||time-(peerAt.get(from)??-10)<.75||time-(bodyAt.get(it.id)??-10)<.5)return false;
  if(brake){
   if(!approachingCargo(it,p.pos)||!brakeCargo(it))return false;
   bursts.delete(it.id);
  }else{
   if(!impulseCargo(it,p.look,{deltaSpeed:1.6,maxImpulse:55,maxSpeed:2.5}))return false;
   bursts.set(it.id,{from,token:d.token,left:.3,look:p.look.clone()});
  }
  seen.set(from,d.n);peerAt.set(from,time);bodyAt.set(it.id,time);return true;
 }
 const step=dt=>{
  if(!bursts.size)return;
  if(!game.isHost||!active()){bursts.clear();return;}
  for(const[id,b]of bursts){
   const it=game.items?.get?.(id),p=b.token===cargoToken(game.run)?reachable(b.from,it):null;
   if(!p||p.look.dot(b.look)<.8){bursts.delete(id);continue;}
   const used=Math.min(Math.max(0,dt),b.left);
   impulseCargo(it,p.look,{deltaSpeed:12*used,maxImpulse:55,maxSpeed:2.5});
   b.left-=used;if(b.left<=1e-6)bursts.delete(id);
  }
 };
 if(game.physics?.addPreStep)offs.push(game.physics.addPreStep(step));
 if(typeof game.findInteraction==='function')offs.push(wrapMethod(game,'findInteraction',old=>function(...args){
  const target=old.apply(this,args),it=target?.bigItem;
  if(!active()||!eligible(it)||!freeHands(game.selfId)||game.grab?.item||!game.player?.pos||game.player.pos.distanceTo(it.obj.position)>2.8)return target;
  const key=String(game.settings?.keys?.interact||'KeyE').replace(/^Key/,'').replace(/^Digit/,'');
  const brake=approachingCargo(it,game.player.pos);
  return {...target,label:nudgeLabel(it.def.name,key,brake),action:()=>{if(game.input?.enabled===false||game.ui?.panelOpen||game.terminal?.active||game.minigame)return;game.net.request('cg20n',{id:it.id,op:brake?'brake':'push',token:cargoToken(game.run),n:++nonce});}};
 }));
 const on=(ev,fn)=>{const off=game.mods?.on?.(ev,fn);if(off)offs.push(off);};
 on('registerHandlers',(H,g)=>{if(!g||g===game)H('cg20n',hostNudge);});
 on('mapLoaded',()=>{bodyAt.clear();bursts.clear();});
 on('playerLeave',id=>{seen.delete(id);peerAt.delete(id);});
 return {hostNudge,dispose(){disposed=true;offs.reverse().forEach(f=>f());seen.clear();peerAt.clear();bodyAt.clear();bursts.clear();}};
}
