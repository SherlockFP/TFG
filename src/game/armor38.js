import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {standingConsole38} from './console38.js';
import {TIER_ORDER} from './tiers.js';
import {HOST_ONLY} from '../net/session.js';
import {addTranslations,tf,t} from '../core/i18n.js';
HOST_ONLY.add('up38');
const LABEL='Upgrade {name} to +{level}: {cost} credits [E]';
const ENCHANT='Enchant {name}: {tier} / {cost} credits [E]';
addTranslations({[LABEL]:'{name} güçlendir: +{level} / {cost} kredi [E]',[ENCHANT]:'{name} zırhını büyüle: {tier} / {cost} kredi [E]','Upgrade complete.':'Güçlendirme tamamlandı.','Not enough credits.':'Yeterli kredi yok.'},'tr');
addTranslations({[LABEL]:'Улучшить {name} до +{level}: {cost} кредитов [E]',[ENCHANT]:'Зачаровать {name}: {tier} / {cost} кредитов [E]','Upgrade complete.':'Улучшение завершено.','Not enough credits.':'Недостаточно кредитов.'},'ru');
export function upgradeOffer38(it){
 if(!it||!['weapon','armor'].includes(it.def?.kind)||it._fgBusy)return null;
 const plus=it.plus||0,tier=it.tier||it.def.tier||'common',index=TIER_ORDER.indexOf(tier);
 if(plus<3)return {op:'plus',plus:plus+1,tier,cost:90+plus*90};
 if(it.def.kind==='armor'&&index>=0&&index<2)return {op:'tier',plus,tier:TIER_ORDER[index+1],cost:240*(index+1)};
 return null;
}
export function installArmor38(game){
 let disposed=false;const offs=[],seen=new Map();
 const anchor=()=>game.ship?.points?.charger;
 const selected=()=>{const held=game.player?.heldItem?.();return upgradeOffer38(held)?held:game.inventory?.equipped?.('armor');};
 const receipt=it=>({id:it.id,plus:it.plus||0,tier:it.tier||it.def.tier||'common',moon:game.run?.moon,seed:game.run?.seed,depth:game.world?.descent21Depth||0});
 const valid=(d,from)=>{
  if(disposed||!game.isHost||!['orbit','moon','company'].includes(game.run?.phase)||d?.moon!==game.run.moon||d.seed!==game.run.seed||d.depth!==(game.world?.descent21Depth||0))return false;
  const p=from===game.selfId?game.player:game.remotes.get(from),at=anchor();if(!p?.pos||p.dead||p.downed||game.downed?.isDowned?.(from)||!at)return false;
  if(!standingConsole38(game,p))return false;
  const eye=p.pos.clone().add(new THREE.Vector3(0,Number.isFinite(p.eye)?p.eye:1.62,0)),dir=at.clone().sub(eye),dist=dir.length();
  return dist<2.8&&(dist<.15||!game.physics.raycast(eye,dir.normalize(),dist-.15,G.STATIC|G.DOOR));
 };
 const request=(d,from)=>{
  if(!valid(d,from)||typeof d.nonce!=='string'||d.nonce.length>100)return false;
  const it=game.items.get(d.id),offer=upgradeOffer38(it);if(!offer||it.holder!==from||d.plus!==(it.plus||0)||d.tier!==(it.tier||it.def.tier||'common'))return false;
  const key=from+':'+d.nonce;if(seen.has(key))return false;
  if((game.run.credits||0)<offer.cost){game.net.sendTo(from,'up38',{ok:false,text:'Not enough credits.'});return false;}
  seen.set(key,true);if(seen.size>256)seen.delete(seen.keys().next().value);
  game.run.credits-=offer.cost;it.plus=offer.plus;it.tier=offer.tier;
  game.net.broadcast('fgit',{id:it.id,pl:it.plus,oc:it.oc||[],tr:it.tier});game.broadcastRun?.(['credits']);game.refreshStats?.();game.hostSave?.();
  game.net.sendTo(from,'up38',{ok:true,text:'Upgrade complete.'});return true;
 };
 offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g===game)H('up38req',request);}));
 let serial=0;
 offs.push(game.mods.on('interactables',(out,g)=>{if(g!==game||disposed||game.player?.dead)return;const it=selected(),offer=upgradeOffer38(it),pos=anchor();if(!offer||!pos)return;
  out.push({pos,r:.35,reach:2.3,label:()=>tf(offer.op==='plus'?LABEL:ENCHANT,{name:t(it.def.name),level:offer.plus,tier:offer.tier,cost:offer.cost}),action:()=>game.net.request('up38req',{...receipt(it),nonce:`${game.selfId}:${++serial}:${game.time}`})});
 }));
 const notify=d=>game.ui?.toast?.(t(d.text),d.ok?'good':'bad');let bound=null;
 const bind=net=>{if(bound===net)return;bound?.off?.('up38',notify);bound=net;bound?.on_?.('up38',notify);};
 offs.push(game.mods.on('netReady',(net,g)=>{if(g===game)bind(net);}));if(game.net)bind(game.net);
 return {request,dispose(){if(disposed)return;disposed=true;for(const off of offs)off?.();bound?.off?.('up38',notify);seen.clear();}};
}
