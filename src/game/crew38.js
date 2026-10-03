import {t,tf,addTranslations} from '../core/i18n.js';
import {insideShip} from '../world/ship.js';
import {dropPoint} from '../world/shiplayout.js';
import {departureCrew39} from './extraction39.js';
const DEPART='Departure in {n} s — {aboard}/{total} aboard · {away} away';
addTranslations({[DEPART]:'Kalkışa {n} sn — {aboard}/{total} gemide · {away} dışarıda','Cancel departure [E]':'Kalkışı iptal et [E]','The ship waits for a crew member to pull the lever.':'Gemi, bir ekip üyesinin kolu çekmesini bekler.','Radio issued. Hold it and press E to switch it on.':'Telsiz verildi. Eline alıp E ile aç.'},'tr');
addTranslations({[DEPART]:'Вылет через {n} с — {aboard}/{total} на борту · {away} снаружи','Cancel departure [E]':'Отменить вылет [E]','The ship waits for a crew member to pull the lever.':'Корабль ждёт, пока член экипажа потянет рычаг.','Radio issued. Hold it and press E to switch it on.':'Рация выдана. Возьмите её и нажмите E, чтобы включить.'},'ru');
export function installCrew38(game){
 const offs=[];let banner=null,disposed=false,bannerDisplay='',bannerText='';
 function issue(onlyId){
  if(!game.isHost||!game.run||!game.items?.all)return;
  for(const it of [...game.items.all()])if(it.type==='taser')game.net.broadcast('it',{e:'rm',id:it.id});
  const ledger=game.run.radio38||(game.run.radio38=[]);
  for(const [id,p]of[[game.selfId,game.player],...game.remotes.entries()]){
   if(onlyId!==undefined&&id!==onlyId)continue;
   if(!p||p.dead||ledger.includes(id)||ledger.length>=32)continue;
   if([...game.items.all()].some(it=>it.type==='walkie'&&it.holder===id)){ledger.push(id);continue;}
   ledger.push(id);
   const aboard=insideShip(p.pos),free=Array.isArray(p.slots)&&p.slots.some(x=>!x);
   game.items.hostSpawn('walkie',dropPoint(0),{holder:aboard&&free?id:null});
   if(id===game.selfId)game.ui?.toast?.(t('Radio issued. Hold it and press E to switch it on.'),'info');
  }
  game.broadcastRun?.(['radio38']);
 }
 offs.push(game.mods.on('hostStart',g=>{if(g===game)issue();}));
 // Native host join emits after admission and welcome snapshot; the new item
 // packet follows that snapshot and reconnects retain the same run receipt.
 offs.push(game.mods.on('playerJoin',(id,info,g)=>{if(g===game&&game.isHost&&game.net.players?.has(id)&&game.remotes.has(id))issue(id);}));
 offs.push(game.mods.on('phase',(ph,g)=>{if(g===game&&ph==='moon')issue();}));
 offs.push(game.mods.on('update',(_,g)=>{
  if(disposed||g!==game||typeof document==='undefined')return;
  const n=game.run?.departure38?.seconds;
  if(!(n>0)){if(banner&&bannerDisplay!=='none'){bannerDisplay='none';banner.style.display='none';}return;}
  if(!banner){banner=document.createElement('div');banner.className='departure38';banner.style.cssText='position:fixed;top:18%;left:50%;transform:translateX(-50%);padding:8px 15px;background:#20272ded;border:1px solid #bda772;color:#e7dbc0;font:18px monospace;text-align:center;pointer-events:none;z-index:65';document.body.appendChild(banner);}
  if(bannerDisplay!==''){bannerDisplay='';banner.style.display='';}
  const text=tf(DEPART,{n:Math.ceil(n),...departureCrew39(game)});if(text!==bannerText){bannerText=text;banner.textContent=text;}
 }));
 return {issue,dispose(){disposed=true;banner?.remove();offs.forEach(f=>f());}};
}
