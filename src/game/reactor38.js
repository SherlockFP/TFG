// One native core, one flight charge. Socket state replaces world custody only
// after a valid physical exchange; legacy campaigns get one bootstrap charge.
import * as THREE from 'three';
import {insideShip} from '../world/ship.js';
import {SPOTS} from '../world/shiplayout.js';
import {G} from '../physics/physics.js';
import {t,tf,addTranslations,sysMsg} from '../core/i18n.js';
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
 ['Company emergency refuel — ▮60 [E]','Şirket acil yakıtı — ▮60 [E]','Аварийная заправка компании — ▮60 [E]'],
 ['Pay ▮60 team credits. Any unpaid part comes from later salvage sales; quota credit stays unchanged.','Ekip kredisiyle ▮60 öde. Eksik tutar sonraki hurda satışlarından kesilir; kota geliri değişmez.','Цена — ▮60 кредитов команды. Остаток удержат из будущих продаж; зачёт квоты не изменится.'],
 ['Emergency fuel installed. One journey ready.','Acil yakıt takıldı. Bir yolculuk hazır.','Аварийное топливо установлено. Один рейс готов.'],
 ['Fuel empty. Route to 0-Algorithm HQ for emergency refuel at the engine-room socket, or install a recovered Main Server Core.','Yakıt tükendi. Motor odasındaki yuvadan acil yakıt almak için 0-Algorithm HQ’ya rota çiz veya bulduğun Ana Sunucu Çekirdeğini tak.','Топливо закончилось. Лети в 0-Algorithm HQ за аварийной заправкой в машинном отделении или установи найденное ядро сервера.'],
 ['Install for the next journey or sell for quota · emergency fuel at HQ costs ▮60','Sonraki yolculuk için tak veya kota için sat · HQ’da acil yakıt ▮60','Установи для следующего рейса или продай ради квоты · аварийное топливо в HQ стоит ▮60'],
 ['Take the Main Server Core to the engine room: install it for the next journey, or sell it and refuel at HQ','Ana Sunucu Çekirdeğini motor odasına götür: sonraki yolculuk için tak veya satıp HQ’da yakıt al','Отнеси ядро в машинное отделение: установи для следующего рейса или продай и заправься в HQ'],
 ['Remove the spent core in the engine room, then install a recovered core or use Company emergency refuel','Motor odasında tükenmiş çekirdeği çıkar; sonra bulduğun çekirdeği tak veya Şirket acil yakıtını kullan','Извлеки отработанное ядро в машинном отделении; установи найденное или закажи аварийное топливо'],
 ['Use the empty engine-room socket: install a recovered core or get Company emergency refuel for ▮60','Boş motor odası yuvasını kullan: bulduğun çekirdeği tak veya ▮60 karşılığında Şirket acil yakıtını al','У пустого гнезда в машинном отделении установи найденное ядро или закажи аварийное топливо за ▮60'],
 ['Emergency refuel already used this HQ visit. Install a recovered core, or depart and return to HQ for service.','Bu HQ ziyaretinde acil yakıt kullanıldı. Bulduğun çekirdeği tak veya kalkıp hizmet için HQ’ya tekrar dön.','В эту поездку в HQ аварийная заправка уже использована. Установи найденное ядро или вылети и вернись за обслуживанием.'],
 ['Emergency fuel balance: ▮{debt}, deducted from later salvage income.','Acil yakıt bakiyesi: ▮{debt}; sonraki hurda gelirinden kesilecek.','Остаток за топливо: ▮{debt}; удержат из будущих продаж.'],
 ];
for(const [i,lang]of[[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
const HELP=rows[3][0];
const SERVICE_PRICE=60, SERVICE=rows[9][0], SERVICE_HELP=rows[10][0], RECOVER=rows[12][0], CORE_CHOICE=rows[13][0];
const money=n=>Number.isFinite(Number(n))?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(Number(n)))):0;
const append=(sub,cue)=>sub?.includes(cue)?sub:[sub,cue].filter(Boolean).join(' · ');
export function installReactor38(game){
 const offs=[],restores=[];let disposed=false;
 const socket=()=>{const r=SPOTS.reactor;return r?new THREE.Vector3(r.x-.61,1.3,r.z):null;};
 const state=()=>game.run?.reactor38;
 const receipt=()=>({token:`${game.run?.runId}:${game.run?.moon}:${game.run?.seed}:${game.run?.day}:${game.run?.phase}`,revision:`${state()?.exchanged||0}:${state()?.installed?.id||''}:${state()?.ready?1:0}:${state()?.services||0}`});
 const persist=()=>{game.broadcastRun?.(['reactor38']);game.hostSave?.();};
 const tell=(id,key,kind='info')=>game.net.sendTo(id,'sys',sysMsg(key,{},kind));
 const wrap=(key,fn)=>{const old=game[key];if(typeof old!=='function')return;const own=Object.hasOwn(game,key),next=fn(old);game[key]=next;restores.push(()=>{if(game[key]===next){if(own)game[key]=old;else delete game[key];}});};
 function bootstrap(){if(game.isHost&&game.run&&!state()){game.run.reactor38={version:38,ready:true,installed:{id:`starter38:${game.run.runId||'run'}`,value:0,baseValue:0},exchanged:0};persist();}}
 const atHQ=()=>game.run?.phase==='company'&&game.run.moon==='hq'&&game.world?.moonId==='hq'&&game.world.seed===game.run.seed&&!!game.world.company;
 const positiveCore=it=>it?.type==='reactor'&&it.value>0&&!it.soulbound;
 const aboardCore=()=>[...game.items.all()].some(it=>{
  if(!positiveCore(it))return false;
  if(!it.holder)return it.state==='world'&&insideShip(it.obj.position);
  const p=it.holder===game.selfId?game.player:game.net.players?.has(it.holder)?game.remotes.get(it.holder):null;
  return !!p&&!p.dead&&!p.downed&&!game.downed?.isDowned?.(it.holder)&&insideShip(p.pos);
 });
 const help=()=>game.run?.phase==='moon'?HELP:RECOVER;
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
  }else if(d?.op==='service'){
   // Reserve the complete service receipt before any synchronous delivery.
   // Each HQ visit admits one charge; fuel never enters sellable world custody.
   if(!atHQ()||st.installed||st.ready||st.serviceAt===r.token||!game.net.players?.has(from)||game.net.lost?.has(from))return;
   const credits=money(game.run.credits),paid=Math.min(SERVICE_PRICE,credits);
   const services=Math.min(Number.MAX_SAFE_INTEGER,money(st.services)+1);
   st.serviceAt=r.token;st.services=services;
   st.serviceDebt=Math.min(Number.MAX_SAFE_INTEGER,money(st.serviceDebt)+SERVICE_PRICE-paid);
   st.installed={id:`emergency38:${game.run.runId}:${game.run.seed}:${services}`,value:0,baseValue:0};st.ready=true;
   game.run.credits=credits-paid;
   game.broadcastRun?.(['reactor38','credits']);game.hostSave?.();tell(from,rows[11][0],'good');
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
  if(game.run?.phase==='orbit'&&!game.run?.fleet13?.docked&&game.run.moon!=='hq'&&state()&&!state().ready){tell(from,RECOVER,'bad');return;}
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
 const settledSales=new WeakSet();
 offs.push(game.mods.on('salvageCredit38',(sale,g)=>{
  if(disposed||g!==game||!game.isHost||!state()||!sale||settledSales.has(sale)||!(sale.total>0)||!(sale.credit>0))return;
  settledSales.add(sale);
  const paid=Math.min(money(state().serviceDebt),money(sale.credit));
  state().serviceDebt=money(state().serviceDebt)-paid;sale.credit-=paid;sale.fuelPaid=paid;
 }));
 wrap('findInteraction',old=>function(...args){
  const target=old.apply(this,args);
  return !disposed&&positiveCore(target?.pickupItem)?{...target,sub:append(target.sub,t(CORE_CHOICE))}:target;
 });
 offs.push(game.mods.on('scanLabels',(labels,eye,fwd,g)=>{
  if(disposed||g&&g!==game||!Array.isArray(labels))return;
  // Only annotate native admitted labels; scan range/LOS/value remain owners.
  for(const label of labels)if(label.type==='reactor'&&positiveCore(game.items.get(label.itemId)))label.sub=append(label.sub,t(CORE_CHOICE));
 }));
 offs.push(game.mods.on('objectives',(add,g,phase)=>{
  const st=state(),p=game.player;
  if(disposed||g!==game||!st||st.ready||!p||p.dead||p.downed||game.run?.fleet13?.docked||!['orbit','moon','company'].includes(phase)||phase!=='orbit'&&!p.inShip)return;
  const hasCore=aboardCore();
  // A new landing must still teach the airlock/entrance before fuel chores.
  // Finding a core explains its choice on the native pickup and scan labels.
  if(phase==='moon'&&!hasCore)return;
  const text=hasCore?rows[14][0]:phase==='company'?st.installed?rows[15][0]:rows[16][0]:RECOVER;
  const o=add(t(text),'main');if(o){o.cat='loot';o.lead=true;}
 }));
 offs.push(game.mods.on('interactables',(list,g)=>{
  if(g!==game||!state()||!insideShip(game.player.pos)||game.player.dead||game.player.downed)return;
  const st=state(),held=game.player.heldItem?.();
  const r=receipt(),service=atHQ()&&!st.installed&&!st.ready&&st.serviceAt!==r.token&&!positiveCore(held);
  list.push({pos:socket(),r:.55,reach:2.7,label:()=>t(st.installed?(st.ready?rows[8][0]:rows[0][0]):positiveCore(held)?rows[1][0]:service?SERVICE:rows[6][0]),sub:()=>{
   const base=st.ready?rows[2][0]:service?SERVICE_HELP:atHQ()&&st.serviceAt===r.token?rows[17][0]:help();
   return money(st.serviceDebt)?`${t(base)} ${tf(rows[18][0],{debt:money(st.serviceDebt)})}`:t(base);
  },action:()=>game.net.request('reactor38',{...r,...(st.installed?{op:'remove'}:service?{op:'service'}:{op:'install',id:held?.id})})});
 }));
 let core=null;
 offs.push(game.mods.on('update',(_,g)=>{
  if(g!==game||disposed)return;
  core=game.ship?.deco?.group?.userData?.reactorCore||game.ship?.group?.getObjectByName?.('reactorCore');
  if(core&&state()){core.visible=!!state().installed;core.material.color.setHex(state().ready?0xd6b878:0x534f48);}
 }));
 return {state,exchange,socket,receipt,bootstrap,dispose(){disposed=true;if(core)core.visible=true;offs.forEach(f=>f());restores.reverse().forEach(f=>f());}};
}
