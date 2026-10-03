import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {physicalReach21} from '../world/descent21.js';
import {MOONS} from './moons.js';
import {t,addTranslations} from '../core/i18n.js';
export const AIR38_MAX=240;
const REFILL='Refill air [E]',LOW='Air low. Refill a cylinder or leave the facility.';
addTranslations({[REFILL]:'Oksijeni doldur [E]',[LOW]:'Oksijen az. Tüp bul veya tesisten çık.','AIR':'OKSİJEN'},'tr');
addTranslations({[REFILL]:'Заправить воздух [E]',[LOW]:'Мало воздуха. Найдите баллон или выйдите из объекта.','AIR':'ВОЗДУХ'},'ru');
export function installOxygen38(game){
 const offs=[];let disposed=false,facility=null,key='',bottles=[],group=null,last=game.time||0,publishAt=0,hurtAt=new Map(),warned=false,hudDisplay='',hudText='',hudColor='';
 const token=()=>`${game.run?.runId||''}:${game.run?.day||0}:${game.run?.moon}:${game.run?.seed}:${game.world?.descent21Depth||0}`;
 const active=()=>{const m=MOONS[game.run?.moon];return !!m&&!m.company&&!m.home&&!m.expedition&&!m.instance&&!m.voyage&&!m.raid&&!m.goal&&!m.customMap&&game.run?.phase==='moon'&&game.world?.moonId===game.run.moon&&game.world?.seed===game.run.seed&&!!game.world?.facility;};
 const state=()=>{if(!game.run)return null;if(game.isHost){const s=game.run.oxygen38;if(!s||s.runId!==game.run.runId||!s.players||!s.used)game.run.oxygen38={runId:game.run.runId,players:{},used:{}};}return game.run.oxygen38;};
 const used=id=>{const history=state()?.used;return !!history&&(!!history[`${key}:${id}`]||Object.keys(history).length>=384);};
 function clear(){group?.removeFromParent();group?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group=null;facility=null;key='';bottles=[];}
 function ensure(){if(!active()){if(group)clear();return;}if(facility===game.world.facility&&key===token())return;clear();facility=game.world.facility;key=token();
  const reach=physicalReach21(facility,game.physics),spots=(facility.scrapSpots||[]).filter(p=>!p.sealed&&reach(p.x,p.z));
  const chosen=[];for(const p of spots){if(chosen.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<6))continue;chosen.push(p);if(chosen.length===3)break;}
  group=new THREE.Group();group.name='oxygen38-cylinders';facility.group.add(group);
  bottles=chosen.map((p,id)=>{const root=new THREE.Group();root.position.set(p.x,p.y,p.z);group.add(root);
   const body=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.7,7),new THREE.MeshLambertMaterial({color:0x969b96,flatShading:true}));body.position.y=.4;root.add(body);
   const valve=new THREE.Mesh(new THREE.BoxGeometry(.14,.09,.12),new THREE.MeshLambertMaterial({color:0x6b8990,flatShading:true}));valve.position.y=.81;root.add(valve);
   return {id,root,pos:new THREE.Vector3(p.x,p.y+.78,p.z),floor:p.y};});
 }
 function refill(d,from){if(disposed||!game.isHost||!active()||key!==token()||d?.key!==key)return;
  const p=from===game.selfId?game.player:game.remotes?.get(from),b=bottles.find(b=>b.id===d.id);
  if(!p?.pos||p.dead||p.downed||game.downed?.isDowned?.(from)||!b||used(b.id)||Math.abs(p.pos.y-b.floor)>.45||['__proto__','prototype','constructor'].includes(from))return;
  const ground=game.physics.raycast({x:p.pos.x,y:p.pos.y+.3,z:p.pos.z},{x:0,y:-1,z:0},.75,G.STATIC);
  if(!ground||Math.abs(ground.point.y-b.floor)>.2)return;
  const eye=p.pos.clone().add(new THREE.Vector3(0,Number.isFinite(p.eye)?p.eye:1.62,0)),dir=b.pos.clone().sub(eye),dist=dir.length();
  if(dist>2.6||dist>.15&&game.physics.raycast(eye,dir.normalize(),dist-.15,G.STATIC|G.DOOR))return;
  const s=state();s.players[from]=AIR38_MAX;s.used[`${key}:${b.id}`]=true;game.broadcastRun?.(['oxygen38']);game.hostSave?.();
 }
 const hud=typeof document!=='undefined'?document.createElement('div'):null;
 if(hud){hud.style.cssText='position:fixed;left:50%;bottom:92px;transform:translateX(-50%);font:12px monospace;color:#c7c4b5;background:#22282acc;padding:4px 9px;pointer-events:none;z-index:12;display:none';document.body.append(hud);}
 function update(dt,g){if(g!==game||disposed)return;const now=game.time||0,elapsed=Math.max(0,Math.min(1,now-last));last=now;ensure();const s=state();
  if(game.isHost&&s&&elapsed>0){const players=game.aiPlayers?.()||[];if(Object.keys(s.players).length>16){const alive=new Set(players.map(p=>p.id));for(const id of Object.keys(s.players))if(!alive.has(id))delete s.players[id];}for(const p of players){if(p.dead||p.downed||game.downed?.isDowned?.(p.id)||['__proto__','prototype','constructor'].includes(p.id))continue;let air=Number.isFinite(s.players[p.id])?Math.max(0,Math.min(AIR38_MAX,s.players[p.id])):AIR38_MAX;
    const inside=active()&&!p.inShip&&(p.zone==='in'||p.indoor===true)&&Math.abs(p.pos.y-facility.layout.y)<4;
    const sprint=p.sprinting||(p.id===game.selfId?game.player?.sprinting:game.remotes?.get(p.id)?.sprinting);
    air=Math.max(0,Math.min(AIR38_MAX,air+(inside?-elapsed*(sprint?1.15:1):elapsed*24)));s.players[p.id]=air;
    if(inside&&air<=0&&now-(hurtAt.get(p.id)||-Infinity)>=2){hurtAt.set(p.id,now);game.hostHurtPlayer?.(p.id,8,'oxygen');}
   }if(now-publishAt>=1){publishAt=now;game.broadcastRun?.(['oxygen38']);}}
  for(const b of bottles)b.root.visible=!used(b.id);
  const air=s?.players?.[game.selfId]??AIR38_MAX,inside=active()&&game.player?.indoor&&!game.player?.inShip&&!game.player?.dead;
  if(hud){const display=inside?'block':'none',text=`${t('AIR')} ${Math.ceil(air/AIR38_MAX*100)}%`,color=air<45?'#d8a277':'#c7c4b5';if(display!==hudDisplay){hudDisplay=display;hud.style.display=display;}if(text!==hudText){hudText=text;hud.textContent=text;}if(color!==hudColor){hudColor=color;hud.style.color=color;}}
  if(inside&&air<45&&!warned){warned=true;game.ui?.toast?.(t(LOW),'warn');}if(air>=60)warned=false;
 }
 const on=(event,fn)=>offs.push(game.mods.on(event,fn));
 on('update',update);on('registerHandlers',(H,g)=>{if(g===game)H('o38refill',refill);});
 on('facilityWillChange',clear);on('facilityChanged',()=>{facility=null;});
 on('interactables',(out,g)=>{if(g!==game||!active())return;for(const b of bottles)if(!used(b.id))out.push({pos:b.pos,r:.24,reach:2.6,label:t(REFILL),action:()=>game.net.request('o38refill',{key,id:b.id})});});
 const old=game.unloadMap;if(typeof old==='function'){const next=function(...args){clear();return old.apply(this,args);};game.unloadMap=next;offs.push(()=>{if(game.unloadMap===next)game.unloadMap=old;});}
 return {refill,clear,get bottles(){return bottles;},get key(){return key;},dispose(){if(disposed)return;disposed=true;clear();hud?.remove();for(const off of offs)off();}};
}
