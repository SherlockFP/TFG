import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {standingConsole38} from './console38.js';
import {RNG} from '../core/rng.js';
import {ITEMS} from './items.js';
import {HOST_ONLY} from '../net/session.js';
import {addTranslations,tf,t} from '../core/i18n.js';
HOST_ONLY.add('pk38');
const DRINKS={rush:{cost:35,speed:25},repair:{cost:45,heal:30}};
const TEXT={crate:'Salvage cabinet: random weapon / 120 credits [E]',rush:'Rush tonic: sprint 25s / 35 credits [E]',repair:'Repair tonic: +30 health / 45 credits [E]'};
addTranslations({[TEXT.crate]:'Hurda dolabı: rastgele silah / 120 kredi [E]',[TEXT.rush]:'Hız içeceği: 25 sn koşu / 35 kredi [E]',[TEXT.repair]:'Onarım içeceği: +30 sağlık / 45 kredi [E]','Not enough credits.':'Yeterli kredi yok.','Supply delivered.':'Malzeme teslim edildi.'},'tr');
addTranslations({[TEXT.crate]:'Шкаф снабжения: случайное оружие / 120 кредитов [E]',[TEXT.rush]:'Тоник скорости: бег 25 с / 35 кредитов [E]',[TEXT.repair]:'Ремонтный тоник: +30 здоровья / 45 кредитов [E]','Supply delivered.':'Припасы доставлены.'},'ru');
export function mysteryWeapon38(run,serial){
 const rows=[['pipe',42],['shovel',30],['machete',18],['sledge',8],['katana',2]].filter(([id])=>ITEMS[id]?.kind==='weapon'&&!ITEMS[id].noShop);
 return new RNG(`${run.runId||'crew'}:${run.seed}:${run.day}:${serial}`).weighted(rows.map(([id,w])=>({id,w})))?.id||'pipe';
}
export function installPerk38(game){
 let disposed=false,serial=0,bound=null;const offs=[],accepted=new Set();
 const at=op=>{
  if(op==='crate')return game.ship?.points?.cupboard?.clone();
  const point=game.ship?.points?.coffee?.clone();if(point)point.x+=op==='rush'?-.22:.22;return point;
 };
 const receipt=op=>({op,moon:game.run?.moon,seed:game.run?.seed,depth:game.world?.descent21Depth||0,nonce:`${game.selfId}:${game.time}:${++serial}`});
 function request(d,from){
  if(disposed||!game.isHost||!['orbit','moon','company'].includes(game.run?.phase)||!['crate','rush','repair'].includes(d?.op)||d.moon!==game.run.moon||d.seed!==game.run.seed||d.depth!==(game.world?.descent21Depth||0)||typeof d.nonce!=='string'||d.nonce.length>100)return false;
  const p=from===game.selfId?game.player:game.remotes.get(from),target=at(d.op);if(!p?.pos||p.dead||p.downed||game.downed?.isDowned?.(from)||!target)return false;
  if(!standingConsole38(game,p))return false;
  const eye=p.pos.clone().add(new THREE.Vector3(0,Number.isFinite(p.eye)?p.eye:1.62,0)),dir=target.clone().sub(eye),distance=dir.length();if(distance>=2.8||distance>.15&&game.physics.raycast(eye,dir.normalize(),distance-.15,G.STATIC|G.DOOR))return false;
  const ledger=game.run.perk38||(game.run.perk38={serial:0,seen:[]}),key=from+':'+d.nonce;if(ledger.seen.includes(key))return false;
  const cost=d.op==='crate'?120:DRINKS[d.op].cost;if((game.run.credits||0)<cost){game.net.sendTo(from,'pk38',{ok:false,text:'Not enough credits.'});return false;}
  ledger.seen.push(key);if(ledger.seen.length>256)ledger.seen.shift();game.run.credits-=cost;
  let item=null;
  if(d.op==='crate'){
   item=mysteryWeapon38(game.run,++ledger.serial);
   const drop=target.clone();drop.z-=.95;drop.y=.5;
   game.items.hostSpawn(item,drop,{tier:(game.run.quotaIndex||0)>=2?'uncommon':'common'});
  }
  game.broadcastRun?.(['credits','perk38']);game.hostSave?.();game.net.sendTo(from,'pk38',{ok:true,nonce:key,op:d.op,item,text:'Supply delivered.'});return true;
 }
 const receive=d=>{
  if(!d?.ok){game.ui?.toast?.(t(d?.text||'Not enough credits.'),'bad');return;}
  if(accepted.has(d.nonce))return;accepted.add(d.nonce);if(accepted.size>256)accepted.delete(accepted.values().next().value);
  if(d.op==='rush'){game.player.speedBoost=Math.max(game.player.speedBoost||0,25);game.player.stamina=game.player.maxStamina;}
  else if(d.op==='repair'){game.player.hp=Math.min(game.player.maxHp,game.player.hp+30);game.net.send?.('pst',{hp:game.player.hp});}
  game.ui?.toast?.(d.item?t(ITEMS[d.item]?.name||d.item):t(d.text),'good');game.sfx?.('heal',.5);
 };
 const bind=net=>{if(bound===net)return;bound?.off?.('pk38',receive);bound=net;bound?.on_?.('pk38',receive);};
 offs.push(game.mods.on('netReady',(net,g)=>{if(g===game)bind(net);}));if(game.net)bind(game.net);
 offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g===game)H('pk38req',request);}));
 offs.push(game.mods.on('interactables',(out,g)=>{if(g!==game||disposed||game.player?.dead)return;
  // Replace the original free stamina coffee prompt with two original paid drink buttons.
  const coffee=game.ship?.points?.coffee;if(coffee){const i=out.findIndex(ip=>ip.pos?.distanceTo?.(coffee)<.01);if(i>=0)out.splice(i,1);}
  for(const op of ['crate','rush','repair']){const pos=at(op);if(pos)out.push({pos,r:op==='crate'?.35:.18,reach:2.3,label:()=>t(TEXT[op]),action:()=>game.net.request('pk38req',receipt(op))});}
 }));
 return {request,receive,dispose(){if(disposed)return;disposed=true;for(const off of offs)off?.();bound?.off?.('pk38',receive);accepted.clear();}};
}
