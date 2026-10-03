// One native core, one flight charge. Socket state replaces world custody only
// after a valid physical exchange; legacy campaigns get one bootstrap charge.
import * as THREE from 'three';
import {insideShip} from '../world/ship.js';
import {SPOTS} from '../world/shiplayout.js';
import {G} from '../physics/physics.js';
import {t,addTranslations,sysMsg} from '../core/i18n.js';
import {physicalReach21} from '../world/descent21.js';
import {standingConsole38} from './console38.js';
const rows=[
 ['Remove spent server core [E]','Tükenmiş sunucu çekirdeğini çıkar [E]','Извлечь отработанное ядро [E]'],
 ['Install held server core [E]','Eldeki sunucu çekirdeğini tak [E]','Установить ядро из рук [E]'],
 ['Ship reactor: one journey ready','Gemi reaktörü: bir yolculuk hazır','Реактор: один рейс готов'],
 ['Find a Main Server Core inside. Remove the spent core and install the new one in the engine room.','İçeride Ana Sunucu Çekirdeği bul. Motor odasında eski çekirdeği çıkarıp yenisini tak.','Найди ядро внутри. Извлеки старое и установи новое в машинном отделении.'],
 ['Remove the old core first.','Önce eski çekirdeği çıkar.','Сначала извлеки старое ядро.'],
 ['Core installed. Next journey powered.','Çekirdek takıldı. Sonraki yolculuğun enerjisi hazır.','Ядро установлено. Следующий рейс обеспечен энергией.'],
 ['Main Server Core required [E]','Ana Sunucu Çekirdeği gerekli [E]','Нужно ядро сервера [E]'],
 ['Spent Server Core','Tükenmiş Sunucu Çekirdeği','Отработанное ядро сервера'],
 ['Ship reactor: remove core [E]','Gemi reaktörü: çekirdeği çıkar [E]','Реактор: извлечь ядро [E]'],
 ];
for(const [i,lang]of[[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
const HELP=rows[3][0];
export function installReactor38(game){
 const offs=[],restores=[];let disposed=false;
 const socket=()=>{const r=SPOTS.reactor;return r?new THREE.Vector3(r.x-.61,1.3,r.z):null;};
 const state=()=>game.run?.reactor38;
 const receipt=()=>({token:`${game.run?.runId}:${game.run?.moon}:${game.run?.seed}:${game.run?.day}:${game.run?.phase}`,revision:`${state()?.exchanged||0}:${state()?.installed?.id||''}:${state()?.ready?1:0}`});
 const persist=()=>{game.broadcastRun?.(['reactor38']);game.hostSave?.();};
 const tell=(id,key,kind='info')=>game.net.sendTo(id,'sys',sysMsg(key,{},kind));
 const wrap=(key,fn)=>{const old=game[key];if(typeof old!=='function')return;const own=Object.hasOwn(game,key),next=fn(old);game[key]=next;restores.push(()=>{if(game[key]===next){if(own)game[key]=old;else delete game[key];}});};
 function bootstrap(){if(game.isHost&&game.run&&!state()){game.run.reactor38={version:38,ready:true,installed:{id:`starter38:${game.run.runId||'run'}`,value:0,baseValue:0},exchanged:0};persist();}}
 function valid(from){
  if(!game.isHost||!['orbit','moon','company'].includes(game.run?.phase))return false;
  const p=from===game.selfId?game.player:game.remotes.get(from),s=socket();
  if(!p||p.dead||p.downed||game.downed?.isDowned?.(from)||!s||!standingConsole38(game,p))return false;
  if(from!==game.selfId&&!game.net.players?.has(from))return false;
  const eye=from===game.selfId?p.eyePos():p.pos.clone().add(new THREE.Vector3(0,p.crouch?.95:1.62,0));
  const d=s.clone().sub(eye),len=d.length();if(len<.01||len>3.25)return false;
  const hit=game.physics.raycast(eye,d.divideScalar(len),len,G.STATIC|G.DOOR,p.col);
  return !hit||hit.distance>len-.15;
 }
 function exchange(d,from){
  const st=state(),r=receipt();if(disposed||!st||d?.token!==r.token||d?.revision!==r.revision||!valid(from))return;
  if(d?.op==='remove'&&st.installed){
   const s=socket(),id=st.installed.id;
   if(game.items.get(id))return;
   // Return the same native identity; spent fuel has no salvage value.
   st.installed=null;st.ready=false;persist();
   game.net.broadcast('it',{e:'sp',id,ty:'reactor',v:0,bv:0,p:[s.x-.45,.8,s.z+.2],lb:'Spent Server Core',col:1});
  }else if(d?.op==='install'){
   if(st.installed){tell(from,rows[4][0]);return;}
   const it=game.items.get(d.id);
   if(!it||it.type!=='reactor'||it.holder!==from||!(it.value>0)||it.soulbound)return;
   // Reserve custody before synchronous item self-delivery/reentrant requests.
   st.installed={id:it.id,value:it.value,baseValue:it.baseValue};st.ready=true;st.exchanged=(st.exchanged||0)+1;
   game.net.broadcast('it',{e:'rm',id:it.id});persist();tell(from,rows[5][0],'good');
  }
 }
 wrap('hostLever',old=>function(from){
  bootstrap();
  if(game.run?.phase==='orbit'&&!game.run?.fleet13?.docked&&game.run.moon!=='hq'&&state()&&!state().ready){tell(from,HELP,'bad');return;}
  return old.call(this,from);
 });
 offs.push(game.mods.on('hostStart',g=>{if(g===game)bootstrap();}));
 offs.push(game.mods.on('moonPopulated',g=>{
  if(g&&g!==game||!game.isHost||!state()||game.run?.phase!=='moon')return;
  const fac=game.world?.facility;if(!fac)return;
  const reachable=physicalReach21(fac,game.physics);
  if([...game.items.all()].some(it=>it.type==='reactor'&&it.value>0&&!insideShip(it.obj.position)&&reachable(it.obj.position.x,it.obj.position.z)))return;
  const spot=(fac.scrapSpots||[]).filter(p=>!p.sealed&&reachable(p.x,p.z)).at(-1);
  if(spot)game.items.hostSpawn('reactor',new THREE.Vector3(spot.x,spot.y+.6,spot.z));
 }));
 offs.push(game.mods.on('phase',(ph,g)=>{
  if(g!==game||!game.isHost||!state())return;
  if(ph==='landing'&&game.run.moon!=='hq'&&state().ready){state().ready=false;persist();}
 }));
 offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g===game)H('reactor38',exchange);}));
 offs.push(game.mods.on('interactables',(list,g)=>{
  if(g!==game||!state()||!insideShip(game.player.pos)||game.player.dead||game.player.downed)return;
  const st=state(),held=game.player.heldItem?.();
  const r=receipt();list.push({pos:socket(),r:.55,reach:2.7,label:()=>t(st.installed?(st.ready?rows[8][0]:rows[0][0]):held?.type==='reactor'&&held.value>0?rows[1][0]:rows[6][0]),sub:()=>t(st.ready?rows[2][0]:HELP),action:()=>game.net.request('reactor38',{...r,...(st.installed?{op:'remove'}:{op:'install',id:held?.id})})});
 }));
 let core=null;
 offs.push(game.mods.on('update',(_,g)=>{
  if(g!==game||disposed)return;
  core=game.ship?.deco?.group?.userData?.reactorCore||game.ship?.group?.getObjectByName?.('reactorCore');
  if(core&&state()){core.visible=!!state().installed;core.material.color.setHex(state().ready?0xd6b878:0x534f48);}
 }));
 return {state,exchange,socket,receipt,bootstrap,dispose(){disposed=true;if(core)core.visible=true;offs.forEach(f=>f());restores.reverse().forEach(f=>f());}};
}
