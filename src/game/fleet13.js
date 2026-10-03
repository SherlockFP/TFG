import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { el } from '../core/util.js';
import { buildHub13, HUB13_SPAWN, HUB13_BROKER, HUB13_BOARD } from '../world/hub13.js';
import { FLEET13, sanitizeFleet13, purchaseFleet13, fleetQuote13, fleetSpawnIndex13 } from './fleet13_core.js';
import { fleetPreview13 } from './fleet13_preview.js';
import { sanitize, aboardVolumes } from './shipyard_core.js';
import { SHIP } from '../world/ship.js';
import { BIOMES } from './moons.js';
import { WorldMarker } from '../render/br_fx.js';
import { insideShip } from '../world/ship.js';
import { attentionHot } from '../ui/hud_attention.js';
import { G } from '../physics/physics.js';
const words = {
 'No vessel selected':['Gemi seçilmedi', 'Корабль не выбран'],
 'Selected vessel: {name}':['Seçilen gemi: {name}', 'Выбранный корабль: {name}'],
 'Free starter':['Ücretsiz başlangıç', 'Бесплатный стартовый'],
 'Route surcharge: +{n}%':['Rota ek ücreti: +%{n}', 'Доплата за маршрут: +{n}%'],
 'Scrap sale bonus: +{n}%':['Hurda satış bonusu: +%{n}', 'Бонус продажи добычи: +{n}%'],
 'Cargo rack slots: {n}':['Kargo rafı yuvaları: {n}', 'Мест на грузовых стеллажах: {n}'],
 'Body revival: {n} CR per use':['Cesetten diriltme: kullanım başına {n} CR', 'Воскрешение тела: {n} CR за использование'],
 'Rested buff: {n}s':['Dinlenme bonusu: {n} sn', 'Бонус отдыха: {n} с'],
 'Craft time: −{n}%':['Üretim süresi: −%{n}', 'Время изготовления: −{n}%'],
 'Observation scan range: +{n}%':['Gözlemevi tarama menzili: +%{n}', 'Радиус сканирования обсерватории: +{n}%'],
 'Fitted rooms: {rooms}':['Kurulu odalar: {rooms}', 'Установленные комнаты: {rooms}'],
 'Fitted rooms: core cockpit only':['Kurulu odalar: yalnızca ana kokpit', 'Установленные комнаты: только основная кабина'],
 'Select vessel':['Gemiyi seç', 'Выбрать корабль'],
 'Claim free starter':['Ücretsiz gemiyi al', 'Забрать бесплатный корабль'],
 'Purchase vessel':['Gemiyi satın al', 'Купить корабль'],
 'Need {n} more crew credits':['{n} ekip kredisi daha gerekli', 'Нужно ещё {n} кредитов экипажа'],
 'Personal gear is sold separately. Hull price includes the fitted rooms.':['Kişisel ekipman ayrıca satılır. Gemi fiyatına kurulu odalar dahildir.', 'Личное снаряжение продаётся отдельно. В цену корабля входят установленные комнаты.'],
 'Next: leave the office and board at the departure kiosk.':['Sonra: ofisten çık ve kalkış terminalinden gemiye bin.', 'Далее: выйди из офиса и поднимись на корабль у терминала отправления.'],
 'Start with the free Courier; save your credits for field equipment.':['Ücretsiz Kurye ile başla; kredilerini saha ekipmanı için sakla.', 'Начни с бесплатного Курьера; сохрани кредиты на полевое снаряжение.'],
 'Board {name} at the departure kiosk ({n} m)':['Kalkış terminalinden {name} gemisine bin ({n} m)', 'Поднимись на {name} у терминала отправления ({n} м)'],
 'Claim a free ship at the fleet office ({n} m)':['Gemi ofisinden ücretsiz bir gemi al ({n} m)', 'Забери бесплатный корабль в доковом офисе ({n} м)'],
 'Waiting for the host to dispatch the selected vessel.':['Hostun seçilen gemiyi yola çıkarması bekleniyor.', 'Ожидаем отправления выбранного корабля ведущим.'],
 'Waiting for the host to choose a vessel.':['Hostun gemi seçmesi bekleniyor.', 'Ожидаем выбора корабля ведущим.'],
 'SHIP ENTRY':['GEMİ GİRİŞİ', 'ВХОД НА КОРАБЛЬ'],
 'DEPARTURE':['KALKIŞ', 'ОТПРАВЛЕНИЕ'],
 'FLEET OFFICE':['GEMİ OFİSİ', 'ДОКОВЫЙ ОФИС'],
 'Board {name}':['{name} gemisine bin', 'Подняться на {name}'],
 'Choose a ship at the fleet office first':['Önce gemi ofisinden bir gemi seç', 'Сначала выбери корабль в доковом офисе'],
 'Relay Dock':['Aktarma Rıhtımı','Релейный док'], 'Fleet broker':['Gemi simsarı','Продавец кораблей'],
 'Board selected vessel':['Seçilen gemiye bin','Подняться на выбранный корабль'], 'Return to Relay Dock':['Rıhtıma dön','Вернуться в док'],
 'Only the host can purchase and dispatch the crew.':['Yalnızca host gemi alıp ekibi yola çıkarabilir.','Только ведущий покупает корабль и отправляет экипаж.'],
 'Choose a vessel at the dock office.':['Rıhtım ofisinden bir gemi seç.','Выбери корабль в доковом офисе.'],
 'Board the selected vessel at the departure kiosk.':['Kalkış terminalinden seçilen gemiye bin.','Поднимись на выбранный корабль у терминала отправления.'],
 'Ship rooms and upgrades are saved per vessel.':['Odalar ve geliştirmeler her gemiye ayrı kaydedilir.','Комнаты и улучшения сохраняются для каждого корабля.'],
 'Owned':['Sahip olunan','Куплен'], 'Selected':['Seçili','Выбран'], 'Select':['Seç','Выбрать'], 'Purchase / select':['Satın al / seç','Купить / выбрать'],
 'Packet Courier':['Paket Kuryesi','Пакетный курьер'], 'Cache Hauler':['Önbellek Nakliyecisi','Грузовоз кэша'], 'Recovery Vessel':['Kurtarma Gemisi','Спасательное судно'], 'Signal Surveyor':['Sinyal Araştırmacısı','Разведчик сигнала'],
 'Compact hull. No extra route weight; build your own rooms.':['Kompakt gövde. Ek rota ağırlığı yok; odalarını kendin inşa et.','Компактный корпус. Без лишнего веса маршрута; строй свои комнаты.'],
 'Long freight hull. Cargo sale bonus and engine room; heavier routes.':['Uzun yük gövdesi. Kargo satış bonusu ve motor odası; daha ağır rotalar.','Длинный грузовой корпус. Бонус продажи груза и машинное отделение; тяжёлые маршруты.'],
 'Twin side rooms. Mid-shift body revival and rested crew buff.':['İki yan oda. Seferde cesetten diriltme ve dinlenmiş ekip bonusu.','Две боковые комнаты. Воскрешение тел в рейсе и бонус отдыха экипажа.'],
 'Research wing and roof observatory. Better samples, crafting and scan.':['Araştırma kanadı ve çatı gözlemevi. Daha iyi numuneler, üretim ve tarama.','Лаборатория и обсерватория. Улучшенные образцы, изготовление и сканирование.'],
 'Choose a ship before departure.':['Kalkıştan önce bir gemi seç.','Выбери корабль перед отправлением.'],
 'Visit the dock before launching.':['Kalkıştan önce rıhtıma uğra.','Посети док перед отправлением.'],
 'Purchase failed. Check credits and visit the broker.':['Alım başarısız. Kredini kontrol et ve simsara git.','Покупка не удалась. Проверь кредиты и подойди к продавцу.'],
};
addTranslations(Object.fromEntries(Object.entries(words).map(([k,v])=>[k,v[0]])));
addTranslations(Object.fromEntries(Object.entries(words).map(([k,v])=>[k,v[1]])), 'ru');
export function installFleet13(game) {
 const offs=[], restores=[]; let disposed=false, marker=null, markerKey=''; const entryBudget=new Map();
 const docked=()=>game.run?.phase==='orbit' && game.run?.fleet13?.docked===true;
 const wrap=(obj,key,fn)=>{const old=obj[key]; if(typeof old!=='function')return; const next=fn(old);obj[key]=next;restores.push(()=>{if(obj[key]===next)obj[key]=old;});};
 const near=(from,at,r)=>{const p=from===game.selfId?game.player?.pos:game.remotes.get(from)?.pos;return p && Math.hypot(p.x-at[0],p.y-at[1],p.z-at[2])<r;};
 const request=(op,id)=>game.net?.request('f13act',{op,id});
 const say=s=>game.ui?.toast(t(s),'bad');
 const keepLayout=()=>{const f=game.run?.fleet13;if(f?.selected && game.run.sy)f.owned[f.selected]=sanitize(game.run.sy);if(game.isHost&&f)game.profile.fleet13=sanitizeFleet13(f);};
 const persist=()=>{game.broadcastRun?.(['fleet13','sy','credits']);game.hostSave?.();game.progress?.save?.();};
 // A smaller hull must not strand cargo on a room floor that is about to vanish.
 // Base-core items and all crew-held/bag items keep their existing transforms.
 function relocateRoomCargo(layout){
  if(!game.isHost)return;
  const volumes=aboardVolumes(sanitize(layout)), cargo=[];
  for(const it of game.items?.all?.()||[]){
   const p=it.obj?.position;
   if(!p||it.state!=='world'||it.holder||it.inv||it.carrier||it.ladder||p.y<=-.8)continue;
   const core=p.x>SHIP.x0&&p.x<SHIP.x1&&p.z>SHIP.z0&&p.z<SHIP.z1&&p.y<SHIP.h+.5;
   if(core)continue;
   if(volumes.some(v=>p.x>v.x0&&p.x<v.x1&&p.z>v.z0&&p.z<v.z1&&p.y>v.y0&&p.y<v.y1))cargo.push(it);
  }
  for(let i=0;i<cargo.length;i++){
   const it=cargo[i], spawn=game.ship.spawns[i%game.ship.spawns.length];
   const box=new THREE.Box3().setFromObject(it.obj), size=box.getSize(new THREE.Vector3());
   const y=Math.max(.2,size.y/2+.12)+Math.floor(i/game.ship.spawns.length)*.1;
   game.net.broadcast('it',{e:'drop',id:it.id,p:[spawn.x,y,spawn.z],q:it.obj.quaternion.toArray(),lv:[0,0,0],f13move:true});
  }
 }
 // Native drop assumes a previously held item (which has no body). Reset only
 // these host-authoritative room transfers so host and peer physics both follow.
 if(game.items)wrap(game.items,'onEvent',orig=>function(d,...a){
  if(d?.e==='drop'&&d.f13move===true){const it=this.get(d.id);if(it?.state==='world'&&!it.holder&&!it.inv&&!it.carrier)it.removeBody();}
  return orig.call(this,d,...a);
 });
 function loadHub(){
  if(game.world.moonId==='__relay13'){game.env.setMoon({...BIOMES.pier,sky:0x172632,fog:0x172632},'clear','company');game.env.landingT=1;return;}
  game.unloadMap();const map=buildHub13({physics:game.physics});
  Object.assign(game.world,{moonId:'__relay13',seed:13,outdoor:map,terrain:map.terrain,mapGroup:map.group});game.scene.add(map.group);
  game.env.setMoon({...BIOMES.pier,sky:0x172632,fog:0x172632,planet:0x354b62,ambient:0x7794aa},'clear','company');game.env.landingT=1;game.ship.door.setOpen(true);game.mods.emit('mapLoaded',game.world,game);
 }
 function arrive(){if(!docked())return;loadHub();const p=new THREE.Vector3(...HUB13_SPAWN);p.x+=String(game.selfId||'').length%4*1.2;game.player.teleport(p,Math.PI);}
 function dispatch(){const f=game.run.fleet13;if(!f.selected)return say('Choose a ship before departure.');relocateRoomCargo(game.run.sy);keepLayout();f.docked=false;game.profile.shipyard=sanitize(f.owned[f.selected]);game.run.sy=game.profile.shipyard;persist();game.loadMapFor(game.run,true);game.ship.door.setOpen(false);for(const id of [game.selfId,...game.remotes.keys()])game.net.sendTo(id,'tp',{p:game.ship.spawns[fleetSpawnIndex13(id,game.ship.spawns.length)].toArray(),yaw:Math.PI/2});}
 function open(){
  const ui=game.ui, f=sanitizeFleet13(game.run?.fleet13), panel=ui.panel('wide');
  panel.classList.add('fleet13');
  const selected=f.selected ? t(FLEET13[f.selected].name) : t('No vessel selected');
  const body=el('div',{class:'cp-body'},
   el('p',{},tf('Selected vessel: {name}',{name:selected})),
   el('p',{class:'dim'},t('Ship rooms and upgrades are saved per vessel.')));
  if(!game.isHost)body.append(el('p',{},t('Only the host can purchase and dispatch the crew.')));
  const cards=el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px'});
  for(const [id,def] of Object.entries(FLEET13)){
   const q=fleetQuote13(f,id,game.run.credits), e=q.effects;
   const row=el('section',{class:'menu-row', 'data-vessel':id, 'aria-current':f.selected===id?'true':null,style:'padding:10px;border:1px solid '+(f.selected===id?'#b99655':'var(--line,#53606a)')+';display:block;background:'+(f.selected===id?'#272b27':'#1c2223')},
    el('h3',{style:'margin:0 0 6px;font-size:21px'},t(def.name)+' — '+(q.owned?t('Owned'):q.price===0?t('Free starter'):q.price+' CR')),
    el('div',{class:'fleet13-preview',html:fleetPreview13(q.layout,t(def.name)),style:'margin:8px 0;border:1px solid #454947'}),
    el('p',{class:'dim',style:'margin:4px 0;font-size:16px'},t(def.tip)));
   const facts=[tf('Route surcharge: +{n}%',{n:q.routePct})];
   if(e.sellBonus)facts.push(tf('Scrap sale bonus: +{n}%',{n:Math.round(e.sellBonus*100)}));
   if(e.cargoSlots)facts.push(tf('Cargo rack slots: {n}',{n:e.cargoSlots}));
   if(e.reviveCost)facts.push(tf('Body revival: {n} CR per use',{n:e.reviveCost}));
   if(e.restSec)facts.push(tf('Rested buff: {n}s',{n:e.restSec}));
   if(e.craftTimeMul<1)facts.push(tf('Craft time: −{n}%',{n:Math.round((1-e.craftTimeMul)*100)}));
   if(e.scanMul>1)facts.push(tf('Observation scan range: +{n}%',{n:Math.round((e.scanMul-1)*100)}));
   row.append(el('p',{style:'margin:6px 0;font-size:16px'},q.rooms.length ? tf('Fitted rooms: {rooms}',{rooms:q.rooms.map(r=>t(r.name)+' '+r.tier).join(' · ')}) : t('Fitted rooms: core cockpit only')),el('p',{style:'margin:6px 0;font-size:17px'},facts.join(' · ')));
   const action=f.selected===id?'Selected':q.owned?'Select vessel':q.price===0?'Claim free starter':'Purchase vessel';
   const button=ui.button(t(action),()=>{request('buy',id);ui.closePanel();});
   button.disabled=!game.isHost||!docked()||game.player.dead||game.player.downed||f.selected===id||q.shortfall>0;
   if(q.shortfall)row.append(el('p',{class:'dim'},tf('Need {n} more crew credits',{n:q.shortfall})));
   row.append(button);cards.append(row);
  }
  body.append(cards);
  body.append(el('p',{class:'dim'},t('Personal gear is sold separately. Hull price includes the fitted rooms.')),
   el('p',{},t(f.selected?'Next: leave the office and board at the departure kiosk.':'Start with the free Courier; save your credits for field equipment.')),
   ui.button(t('Close'),()=>ui.closePanel(),'back'));
  panel.append(ui.panelHead(t('Relay Dock'),String(game.run?.credits||0)+' CR'),body,ui.panelFoot());ui.openPanel(panel);
 }
 wrap(game,'hostInit',orig=>function(data,slot){
  let f=sanitizeFleet13(data?.fleet13 || (!data ? {...game.profile.fleet13,docked:true} : null));if(data&&!data.fleet13)f=sanitizeFleet13({docked:false,selected:'courier',owned:{courier:data.sy||game.profile.shipyard||{}}});
  const out=orig.call(this,{...(data||{}),fleet13:f},slot);this.run.fleet13=f;
  if(f.selected){this.profile.shipyard=sanitize(f.owned[f.selected]);this.run.sy=this.profile.shipyard;}if(docked())arrive();persist();return out;
 });
 wrap(game,'loadMapFor',orig=>function(...a){if(docked())return loadHub();return orig.apply(this,a);});
 wrap(game,'spawnInShip',orig=>function(...a){if(docked())return arrive();return orig.apply(this,a);});
 wrap(game,'applyRunState',orig=>function(...a){const before=docked(),out=orig.apply(this,a);if(before!==docked())this.loadMapFor(this.run,true);return out;});
 wrap(game,'hostLever',orig=>function(from){
  if(!docked())return orig.call(this,from);
  // Entering the dock's physical ship does not itself dispatch the fleet.
  // The cockpit control may use the same owned dispatch lifecycle as the kiosk.
  const p=game.player, target=game.ship?.points?.lever;
  if(disposed||from!==game.selfId||!game.isHost||p.dead||p.downed||game.world?.moonId!=='__relay13'||!insideShip(p.pos)||!target)return;
  const eye=p.eyePos(),delta=target.clone().sub(eye),distance=delta.length();
  if(distance>3.36||distance<.01)return;
  const hit=game.physics.raycast(eye,delta.divideScalar(distance),distance,G.STATIC|G.DOOR,p.col);
  if(hit&&hit.distance<=distance-.15)return;
  dispatch();
 });
 wrap(game,'hostSave',orig=>function(...a){keepLayout();return orig.apply(this,a);});
 if(game.objectives)wrap(game.objectives,'compute',orig=>function(...a){
  if(!docked())return orig.apply(this,a);
  const selected=game.run.fleet13.selected, target=selected?HUB13_BOARD:HUB13_BROKER;
  const distance=Math.round(Math.hypot(game.player.pos.x-target[0],game.player.pos.z-target[2]));
  const text=game.isHost ? tf(selected?'Board {name} at the departure kiosk ({n} m)':'Claim a free ship at the fleet office ({n} m)',{name:selected?t(FLEET13[selected].name):'',n:distance}) : t(selected?'Waiting for the host to dispatch the selected vessel.':'Waiting for the host to choose a vessel.');
  return [{text:text,kind:'main',first:true,done:false}];
 });
 offs.push(game.mods.on('update',(dt,g)=>{
  if(g!==game)return;
  const entry=!docked()&&!!game.world?.moonId&&['moon','company'].includes(game.run?.phase)&&!insideShip(game.player.pos);
  const nearby=entry&&!game.player.indoor&&Math.abs(game.player.pos.y)<12&&Math.hypot(game.player.pos.x-SHIP.door.x,game.player.pos.z-SHIP.z1)<24;
  if(game.player.dead||game.player.downed||attentionHot(game)||(!docked()&&!nearby)||(docked()&&!game.isHost)){marker?.dispose();marker=null;markerKey='';return;}
  const landing=`entry:${game.run.moon}:${game.world?.seed}:${game.run.day}:${game.run.fleet13?.selected||'courier'}`;
  const key=entry?landing:(game.run.fleet13.selected?'board':'broker');
  const target=entry?new THREE.Vector3(SHIP.door.x,.6,SHIP.z1+.3):new THREE.Vector3(...(key==='board'?HUB13_BOARD:HUB13_BROKER));
  if(entry&&entryBudget.get(key)<=0)return;
  if(key!==markerKey){marker?.dispose();marker=null;markerKey=key;if(typeof document!=='undefined')marker=new WorldMarker('', entry?'#d9c8a0':'#72e3d6', entry?(entryBudget.get(key)??14):14);if(entry){if(!entryBudget.has(key))entryBudget.set(key,14);if(entryBudget.size>32)entryBudget.delete(entryBudget.keys().next().value);}}
  // Dock tasks retain their single cue until selection/dispatch; reading a panel
  // cannot spend it. The outdoor ship-entry cue keeps its finite landing budget.
  if(marker){const label=t(entry?'SHIP ENTRY':key==='board'?'DEPARTURE':'FLEET OFFICE');const visible=marker.update(entry?dt:0,game.camera,target,label);if(entry)entryBudget.set(key,Math.max(0,marker.life));if(!visible)marker=null;}
 }));
 offs.push(game.mods.on('phase',(ph,g)=>{if(g!==game||ph!=='orbit'||!game.isHost||game.run.fleet13)return;game.run.fleet13=sanitizeFleet13({...game.profile.fleet13,docked:true});persist();arrive();for(const id of game.remotes.keys())game.net.sendTo(id,'tp',{p:HUB13_SPAWN,yaw:Math.PI});}));
 offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g!==game)return;H('f13act',(d,from)=>{
  if(disposed||from!==game.selfId||!game.isHost||game.player.dead||game.player.downed)return;
  if(d?.op==='buy'&&docked()&&near(from,HUB13_BROKER,6)){
   keepLayout();const previous=game.run.fleet13.selected, oldLayout=sanitize(game.run.sy), f=sanitizeFleet13(game.run.fleet13),res=purchaseFleet13(f,game.run,d.id);if(!res.ok)return say('Purchase failed. Check credits and visit the broker.');
   if(previous!==f.selected)relocateRoomCargo(oldLayout);
   game.run.fleet13=f;game.profile.shipyard=sanitize(res.layout);game.run.sy=game.profile.shipyard;persist();
  }else if(d?.op==='board'&&docked()&&near(from,HUB13_BOARD,6))dispatch();
  else if(d?.op==='dock'&&game.run.phase==='orbit'&&game.player.inShip){keepLayout();game.run.fleet13=sanitizeFleet13(game.run.fleet13);game.run.fleet13.docked=true;persist();loadHub();for(const id of [game.selfId,...game.remotes.keys()])game.net.sendTo(id,'tp',{p:HUB13_SPAWN,yaw:Math.PI});}
 });}));
 offs.push(game.mods.on('interactables',(list,g)=>{if(g!==game||game.player.dead||game.player.downed)return;if(docked()){
  const lever=list.find(ip=>ip.pos===game.ship?.points?.lever);
  if(lever)lever.label=game.isHost?t(game.run.fleet13.selected?'Board selected vessel':'Choose a ship at the fleet office first'):t('Only the host can purchase and dispatch the crew.');
  const door=list.find(ip=>ip.pos===game.ship?.points?.doorOpen);
  if(door)door.label=()=>t(game.ship.door.open?'Close ship door [E]':'Open ship door [E]');
  list.push({pos:new THREE.Vector3(...HUB13_BROKER),r:1,reach:4,label:t('Fleet broker'),action:open});
  list.push({pos:new THREE.Vector3(...HUB13_BOARD),r:1,reach:4,label:game.run.fleet13.selected?tf('Board {name}',{name:t(FLEET13[game.run.fleet13.selected].name)}):t('Choose a ship at the fleet office first'),action:()=>game.isHost?request('board'):say('Only the host can purchase and dispatch the crew.')});
 }else if(game.run?.phase==='orbit'&&game.player.inShip)list.push({pos:new THREE.Vector3(3,1.1,2.8),r:.8,reach:3,label:t('Return to Relay Dock'),action:()=>game.isHost?request('dock'):say('Only the host can purchase and dispatch the crew.')});}));
 return {docked,open,request,catalog:FLEET13,dispose(){disposed=true;marker?.dispose();marker=null;for(const off of offs)off?.();for(const restore of restores.reverse())restore();}};
}
