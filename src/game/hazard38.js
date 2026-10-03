import * as THREE from 'three';
import {G,RAPIER,groups} from '../physics/physics.js';
import {physicalReach21} from '../world/descent21.js';
import {MOONS} from './moons.js';
import {buildHazards38} from '../models/hazards38.js';
import {sysMsg,addTranslations} from '../core/i18n.js';
const WARNING='Gravitational fissure opening. Leave the side room; recover loose cargo.';
addTranslations({[WARNING]:'Yerçekimi yarığı açılıyor. Yan odadan çık; yerdeki yükü kurtar.'},'tr');
addTranslations({[WARNING]:'Открывается гравитационный разлом. Покиньте боковую комнату и заберите груз.'},'ru');
export function hazardPlan38(game){
 const f=game.world?.facility,L=f?.layout;if(!L||!game.physics?.world)return null;
 const reach=physicalReach21(f,game.physics),roomAt=p=>f.cellAt?L.roomOf[f.cellAt(p.x,p.z)]:-1;
 const protectedRooms=new Set([0,game.descent21?.plan?.()?.roomId]);for(const p of f.interactables||[])if(p.type==='fuse')protectedRooms.add(roomAt(p.pos));
 for(const it of game.items?.all?.()||[])if(it.type==='reactor')protectedRooms.add(roomAt(it.obj.position));
 const links=new Map();for(const d of f.doors||[]){const a=L.roomOf[d.info?.a],b=L.roomOf[d.info?.b];if(a!==b)for(const id of [a,b])if(id>=0){if(!links.has(id))links.set(id,new Set());links.get(id).add(d.info.key);}}
 const candidates=(f.scrapSpots||[]).filter(p=>p.room>0&&!p.sealed&&!protectedRooms.has(p.room)&&reach(p.x,p.z));
 let ceiling=null;for(const p of candidates){const h=game.physics.raycast({x:p.x,y:p.y+1.9,z:p.z},{x:0,y:1,z:0},10,G.STATIC);if(h&&h.normal.y<-.8&&h.point.y-p.y>2.7){ceiling={...p,top:h.point.y};break;}}
 const voidSpot=candidates.find(p=>links.get(p.room)?.size===1&&p.room!==ceiling?.room)||null;
 return ceiling||voidSpot?{ceiling,voidSpot}:null;
}
export function pullClear38(game,p,target){
 const velocity={x:target.x-p.pos.x,y:target.y-p.pos.y,z:target.z-p.pos.z};
 return !game.physics.world.castShape({x:p.pos.x,y:p.pos.y+.92,z:p.pos.z},{x:0,y:0,z:0,w:1},velocity,new RAPIER.Capsule(.56,.34),.005,1,true,undefined,groups(G.PLAYER,G.STATIC|G.DOOR));
}
export function installHazard38(game){
 let disposed=false,facility=null,plan=null,view=null,key='',last=game.time||0,start=0,lastPublish=0;const grabs=new Map(),hurts=new Map(),offs=[];
 const active=()=>{const m=MOONS[game.run?.moon];return !!m&&!m.expedition&&!m.company&&!m.home&&!m.instance&&!m.voyage&&!m.raid&&!m.customMap&&(game.world?.descent21Depth||0)>=2&&game.run?.phase==='moon'&&game.world?.moonId===game.run.moon&&game.world?.seed===game.run.seed&&!!game.world?.facility;};
 const token=()=>`${game.run?.runId}:${game.run?.day}:${game.run?.moon}:${game.run?.seed}:${game.world?.descent21Depth}`;
 const clear=()=>{view?.dispose();view=null;facility=null;plan=null;key='';grabs.clear();hurts.clear();};
 function update(dt,g){if(disposed||g!==game)return;const now=game.time||0,elapsed=Math.max(0,Math.min(.1,now-last));last=now;if(!active()){if(view)clear();return;}
  if(facility!==game.world.facility||key!==token()){clear();facility=game.world.facility;key=token();plan=hazardPlan38(game);start=now;if(plan)view=buildHazards38(facility.group,plan.ceiling,plan.voidSpot);}
  if(!plan)return;
  let state=game.run.hazard38;if(game.isHost&&state?.key!==key){state=game.run.hazard38={key,stage:'waiting',started:now,swallowed:0};game.broadcastRun?.(['hazard38']);}
  const stage=state?.key===key?state.stage:'waiting';view?.update(now,stage);
  if(!game.isHost)return;
  const age=now-state.started;
  if(plan.voidSpot){const next=age<35?'waiting':age<41?'warning':age<53?'active':'spent';if(next!==state.stage){state.stage=next;game.broadcastRun?.(['hazard38']);if(next==='warning')game.net?.broadcast?.('sys',sysMsg(WARNING,{},'warn'));}}
  for(const p of game.aiPlayers?.()||[]){if(p.dead||p.downed||p.inShip||game.downed?.isDowned?.(p.id)||game.net?.lost?.has(p.id)||p.zone!=='in')continue;
   const c=plan.ceiling;
   if(c&&Math.hypot(p.pos.x-c.x,p.pos.z-c.z)<.46&&p.pos.y>=c.y-.15&&p.pos.y<c.top-2){let grab=grabs.get(p.id);if(!grab){grab={start:now,next:now+.65};grabs.set(p.id,grab);}if(now>=grab.next&&now-grab.start<3.2&&!game.balRules?.book?.isFree?.(p.id,now)){const target=p.pos.clone();target.y+=Math.min(.08,elapsed*.8);if(pullClear38(game,p,target)){game.hostHoldPlayer?.(p.id,target);if(now-(hurts.get(p.id)||-Infinity)>2){hurts.set(p.id,now);game.hostHurtPlayer?.(p.id,6,'ceilingtongue');}}}}else grabs.delete(p.id);
   const v=plan.voidSpot;if(v&&state.stage==='active'&&Math.hypot(p.pos.x-v.x,p.pos.z-v.z)<2.1&&Math.abs(p.pos.y-v.y)<.4){game.hostSlowPlayer?.(p.id,.3);if(now-(hurts.get(p.id)||-Infinity)>2){hurts.set(p.id,now);game.hostHurtPlayer?.(p.id,8,'fissure');}}
  }
  if(plan.voidSpot&&state.stage==='active'&&state.swallowed<3){const v=plan.voidSpot;for(const it of game.items?.all?.()||[]){if(it.holder||it.type==='reactor'||!(it.value>0)||it.def?.kind!=='scrap'||Math.hypot(it.obj.position.x-v.x,it.obj.position.z-v.z)>.85||Math.abs(it.obj.position.y-v.y)>1)continue;state.swallowed++;game.net.broadcast('it',{e:'rm',id:it.id});game.broadcastRun?.(['hazard38']);game.hostSave?.();if(state.swallowed>=3)break;}}
 }
 offs.push(game.mods.on('update',update),game.mods.on('facilityWillChange',clear));
 const old=game.unloadMap;if(typeof old==='function'){const next=function(...args){clear();return old.apply(this,args);};game.unloadMap=next;offs.push(()=>{if(game.unloadMap===next)game.unloadMap=old;});}
 return {get plan(){return plan;},dispose(){if(disposed)return;disposed=true;clear();offs.forEach(off=>off());}};
}
