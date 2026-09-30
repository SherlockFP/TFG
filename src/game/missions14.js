import * as THREE from 'three';
import { registerItem } from './items.js';
import { createItemModel } from '../models/items.js';
import { MOONS } from './moons.js';
import { t, addTranslations, sysMsg } from '../core/i18n.js';
import { planRelayVault, buildFieldJob } from '../world/expedition13.js';
registerItem({id:'m14_cell',name:'Sealed Archive Cell',kind:'scrap',value:[0,0],weight:6,hands:2,tier:'rare'});
registerItem({id:'m14_cache',name:'Recovered Archive Cache',kind:'scrap',value:[180,180],weight:8,hands:2,tier:'rare'});
const TXT={
 'Sealed Archive Cell':['Mühürlü Arşiv Hücresi','Запечатанная архивная ячейка'],
 'Recovered Archive Cache':['Kurtarılan Arşiv Kasası','Восстановленный архивный тайник'],
 'Archive recovery [E]':['Arşiv kurtarma [E]','Восстановление архива [E]'],
 'Optional: recover one archive cell. Installing it opens a guarded bonus room. The return corridor stays open.':['İsteğe bağlı: bir arşiv hücresi getir. Takınca korumalı bonus oda açılır. Dönüş koridoru açık kalır.','По желанию: принеси архивную ячейку. Установка открывает охраняемую бонусную комнату. Обратный коридор остаётся открытым.'],
 'Install archive cell [E]':['Arşiv hücresini tak [E]','Установить архивную ячейку [E]'],
 'Guardian ahead. Step back into the return corridor when it winds up.':['İleride muhafız var. Saldırı hazırlanırken dönüş koridoruna geri çekil.','Впереди страж. Когда он замахивается, отступи в обратный коридор.'],
 'Recover the marked cell and carry it to the archive gate.':['İşaretli hücreyi al ve arşiv kapısına taşı.','Забери отмеченную ячейку и принеси к воротам архива.'],
 'Archive Custodian — optional. Return corridor remains open.':['Arşiv Muhafızı — isteğe bağlı. Dönüş koridoru açık.','Хранитель архива — по желанию. Обратный коридор открыт.'],
 'Collect archive cache [E]':['Arşiv kasasını al [E]','Забрать архивный тайник [E]'],
 'Archive cache recovered. Carry the salvage home.':['Arşiv kasası alındı. Hurdayı gemiye taşı.','Тайник получен. Неси добычу на корабль.'],
 'Archive job waits while another guardian or stalker is active.':['Başka bir muhafız veya takipçi varken arşiv görevi bekler.','Архивное задание ждёт, пока активен другой страж или преследователь.'],
};
for(const [lang,i] of [['tr',0],['ru',1]])addTranslations(Object.fromEntries(Object.entries(TXT).map(([k,v])=>[k,v[i]])),lang);
export function planArchive14(world,run){
 const m=MOONS[run?.moon];
 if(!m || Math.max(run.quotaIndex|0,run.hub?.q|0)<2 || (run.seed>>>0)%4!==0 || m.company||m.home||m.expedition||m.goal||m.instance||m.voyage||m.core||m.raid||['echoregistry','embercache'].includes(m.interior))return null;
 const f=world?.facility,p=planRelayVault(f,run.mission14?.gateId);if(!p)return null;
 const L=f.layout,rooms=L.rooms.filter(r=>r.type==='vault').map(r=>({r,x:L.ox+(r.cx+.5)*L.cell,z:L.oz+(r.cz+.5)*L.cell})).sort((a,b)=>Math.hypot(a.x-p.door.pos.x,a.z-p.door.pos.z)-Math.hypot(b.x-p.door.pos.x,b.z-p.door.pos.z));
 const room=rooms[0];if(!room||Math.hypot(room.x-p.door.pos.x,room.z-p.door.pos.z)>L.cell*2||!f.nav.walkableAt(room.x,room.z))return null;
 return {...p,room:room.r,bossPos:new THREE.Vector3(room.x,L.y,room.z),cellPos:new THREE.Vector3(p.nodes[1].x,L.y+.3,p.nodes[1].z)};
}
export function installMissions14(game){
 const offs=[],undo=[];
 const models=game.mods.itemModels;
 if(models)for(const [id,base]of [['m14_cell','reactor'],['m14_cache','register']]){const old=models.get(id),make=()=>createItemModel(base);models.set(id,make);undo.push(()=>{if(models.get(id)===make){if(old)models.set(id,old);else models.delete(id);}});}
 let plan=null,mesh=null,keypad=null;
 const token=()=>`${game.run?.moon}:${game.run?.seed}:${game.run?.day}`;
 const state=()=>game.run?.mission14?.token===token()?game.run.mission14:null;
 const active=()=>!!plan&&game.run?.phase==='moon'&&state()?.stage!=='ready'&&state()?.stage!=='claimed';
 const sync=()=>game.broadcastRun?.(['mission14']);
 const pOf=id=>game.aiPlayerById?.(id)||game.aiPlayers?.().find(p=>p.id===id);
 const near=(p,n)=>p&&!p.dead&&!p.downed&&p.zone==='in'&&Math.hypot(p.pos.x-n.x,p.pos.z-n.z)<4&&Math.abs(p.pos.y-n.y)<3;
 const busy=()=>game.escape14?.active?.()||[...(game.creatures?.host?.values?.()||[])].some(c=>!c.dead&&(c.def?.boss||c.def?.cyBoss));
 const send=op=>game.net.request('m14req',{token:token(),op});
 function clear(){if(plan?.door){plan.door.keypadPos=keypad;delete plan.door.m14gate;}mesh?.removeFromParent();mesh?.traverse(o=>o.geometry?.dispose?.());mesh=null;plan=null;keypad=null;}
 function openGate(){if(plan&&['guard','won','claimed'].includes(state()?.stage)){plan.door.locked=false;game.onDoor?.({id:plan.door.id,open:true,locked:false,silent:false});}}
 function request(d,from){
  if(!game.isHost||!plan||game.run.phase!=='moon'||d?.token!==token())return;
  const s=state(),p=pOf(from);if(!s||!near(p,d.op==='cache'?plan.bossPos:plan.anchor))return;
  if(d.op==='accept'&&s.stage==='ready'){
   if(busy())return game.net.sendTo(from,'sys',sysMsg('Archive job waits while another guardian or stalker is active.'));
   const id=game.items.hostSpawn('m14_cell',plan.cellPos.clone(),{value:0});if(!id)return;s.cellId=id;s.stage='cell';sync();return;
  }
  if(d.op==='install'&&s.stage==='cell'){
   if(busy()||!game.cycle?.bosses?.spawnBoss)return;
   const cell=game.items.get(s.cellId);if(!cell||cell.holder!==from||cell.type!=='m14_cell')return;
   // Opening this optional vault never modifies an essential corridor or exit door.
   const previous={open:plan.door.open,locked:plan.door.locked};
   plan.door.locked=false;game.hostSetDoor?.(plan.door.id,true);
   const boss=game.cycle.bosses.spawnBoss('keyholder',plan.bossPos.clone(),{sector:0,crew:Math.max(1,game.aiPlayers?.().filter(p=>!p.dead).length||1),hpMul:.75,dmgMul:.6,phase2:false,lair:{cx:plan.bossPos.x,cz:plan.bossPos.z,r:4},mission14:true});
   if(!boss){plan.door.locked=previous.locked;game.hostSetDoor?.(plan.door.id,previous.open);return;}
   s.bossId=boss.id;s.stage='guard';game.net.broadcast('it',{e:'rm',id:s.cellId});sync();openGate();return;
  }
  if(d.op==='cache'&&s.stage==='won'){
   const id=game.items.hostSpawn('m14_cache',plan.bossPos.clone().add(new THREE.Vector3(0,.4,.7)),{value:180});if(!id)return;s.rewardId=id;s.stage='claimed';sync();
  }
 }
 offs.push(game.mods.on('warm',(reg,g)=>{
  if(g!==game || !((plan && plan.group===game.world?.facility?.group) || planArchive14(game.world,game.run)))return;
  for(const id of ['m14_cell','m14_cache']){const factory=game.mods.itemModels?.get(id);if(factory)reg(factory(THREE),'m14:'+id);}
  const factory=game.mods.creatureModels?.get('keyholder') || globalThis.window?.__kefalMods?.creatureModels?.get('keyholder');
  if(factory){const model=factory(THREE,{elite:false,seed:1});if(model?.root)reg(model.root,'m14:keyholder');}
 }));
 offs.push(game.mods.on('mapLoaded',(w,g)=>{if(g!==game)return;clear();plan=planArchive14(w,game.run);if(!plan)return;
  keypad=plan.door.keypadPos;plan.door.keypadPos=null;plan.door.m14gate=true;
  mesh=buildFieldJob({...plan,nodes:[{i:0,x:plan.anchor.x,y:plan.anchor.y,z:plan.anchor.z},{i:1,x:plan.cellPos.x,y:plan.cellPos.y+1,z:plan.cellPos.z}]});
  if(game.isHost&&!state()){game.run.mission14={token:token(),gateId:plan.door.id,stage:'ready',cellId:null,bossId:null,rewardId:null};sync();}openGate();
 }));
 offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g!==game)return;H('m14req',request);
  for(const k of ['vault','unlock','door']){const prev=game.net.handlers.get(k);H(k,(d,from)=>{if(plan&&d?.id===plan.door.id)return;prev?.(d,from);});}
 }));
 const original=game.doorInteraction;
 if(original){const replacement=function(door){if(plan?.door!==door)return original.call(this,door);const s=state();return {label:t(s?.stage==='ready'?'Archive recovery [E]':s?.stage==='cell'?'Install archive cell [E]':'Guardian ahead. Step back into the return corridor when it winds up.'),sub:t('Optional: recover one archive cell. Installing it opens a guarded bonus room. The return corridor stays open.'),action:()=>{if(s?.stage==='ready')send('accept');else if(s?.stage==='cell')send('install');}};};game.doorInteraction=replacement;undo.push(()=>{if(game.doorInteraction===replacement)game.doorInteraction=original;});}
 const killed=game.hostOnCreatureKilled;
 if(killed){const replacement=function(c,by){const out=killed.call(this,c,by),s=state();if(this.isHost&&s?.stage==='guard'&&c.id===s.bossId&&c.dead){s.stage='won';sync();}return out;};game.hostOnCreatureKilled=replacement;undo.push(()=>{if(game.hostOnCreatureKilled===replacement)game.hostOnCreatureKilled=killed;});}
 offs.push(game.mods.on('interactables',(out,g)=>{if(g!==game||!plan||game.run.phase!=='moon'||!game.player?.indoor||game.player.dead)return;const s=state();if(!s)return;
  if(s.stage==='ready'||s.stage==='cell')out.push({pos:plan.anchor,r:.7,reach:3,label:t(s.stage==='ready'?'Archive recovery [E]':'Install archive cell [E]'),sub:t('Optional: recover one archive cell. Installing it opens a guarded bonus room. The return corridor stays open.'),action:()=>send(s.stage==='ready'?'accept':'install')});
  if(s.stage==='won')out.push({pos:plan.bossPos.clone().add(new THREE.Vector3(0,1.2,0)),r:1,reach:3,label:t('Collect archive cache [E]'),action:()=>send('cache')});
 }));
 offs.push(game.mods.on('objectives',(add,g,ph)=>{const s=state();if(g!==game||ph!=='moon'||!plan||!s||s.stage==='ready')return;
  add(t(s.stage==='cell'?'Recover the marked cell and carry it to the archive gate.':s.stage==='guard'?'Archive Custodian — optional. Return corridor remains open.':s.stage==='won'?'Collect archive cache [E]':'Archive cache recovered. Carry the salvage home.'),'sub');
 }));
 offs.push(game.mods.on('phase',(ph,g)=>{if(g===game&&ph==='orbit'){clear();if(game.isHost&&game.run?.mission14){game.run.mission14=null;sync();}}}));
 return {reserved:w=>!!(plan && plan.group===w?.facility?.group)||!!planArchive14(w,game.run),active,state,plan:()=>plan,request:send,dispose(){clear();for(const off of offs)off?.();for(const restore of undo.reverse())restore();}};
}
